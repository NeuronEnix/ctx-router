import { match as pathMatch } from "path-to-regexp";
import { TDefaultCtx } from "../core";
import {
  TRoute,
  TRouteEntry,
  THooks,
  THookDSL,
  LogLevel,
  CtxRouterConfig,
  EXACT_KEY_DELIMITER,
} from "./types";
import { TRouterInstance, createRouterInstance } from "./instance";
import { exec as execImpl } from "./lifecycle.exec";
import { ctxRouterErr } from "./error";
import { RouteBuilder, TRouteBuilder } from "./builder";

// Symbol for internal access from RouteBuilder
export const INTERNAL_ROUTER_ACCESS = Symbol("CtxRouter.internal");

// Factory for creating default hooks
function createDefaultHooks<TUserCtx extends TDefaultCtx>(): THooks<TUserCtx> {
  return {};
}

export class CtxRouter<TUserCtx extends TDefaultCtx> {
  // Route storage: exact matches (O(1)) and param routes (regex)
  private exactRoutes = new Map<string, TRouteEntry<TUserCtx>>();
  private paramRoutes: TRouteEntry<TUserCtx>[] = [];

  // Hook state (per router instance)
  private hooks: THooks<TUserCtx>;

  // Sealing flag - prevents hook modification after first exec
  private sealed = false;

  // Public hook DSL (created once, stable reference)
  public readonly hook: THookDSL<TUserCtx, CtxRouter<TUserCtx>>;

  // Stored for future logging implementation (intentionally unused for now)
  private _logLevel: LogLevel;

  // Router-level INSTANCE
  private readonly instance: TRouterInstance;

  constructor(config: CtxRouterConfig = {}) {
    this._logLevel = config.logLevel ?? "standard";
    this.instance = createRouterInstance(config.serviceName);

    // Always create hooks for this router instance
    this.hooks = createDefaultHooks();

    // Create hook DSL once (stable reference, no getter)
    this.hook = this.createHookDSL();

    // Explicitly mark _logLevel as intentionally stored for future logging implementation
    void this._logLevel;
  }

  // Prevents hook modification after first exec
  private assertNotSealed(): void {
    if (this.sealed) {
      throw ctxRouterErr.hook.HOOKS_ALREADY_SEALED();
    }
  }

  // Creates the hook DSL object (called once in constructor)
  private createHookDSL(): THookDSL<TUserCtx, CtxRouter<TUserCtx>> {
    return {
      onExec: {
        before: (fn) => {
          this.assertNotSealed();
          this.hooks.onExecBefore = fn;
          return this;
        },
        after: (fn) => {
          this.assertNotSealed();
          this.hooks.onExecAfter = fn;
          return this;
        },
        error: (fn) => {
          this.assertNotSealed();
          this.hooks.onExecError = fn;
          return this;
        },
        finally: (fn) => {
          this.assertNotSealed();
          this.hooks.onExecFinally = fn;
          return this;
        },
      },
    };
  }

  /**
   * Creates a new context with default values.
   * Does NOT increment inflight or set timing - that happens in exec().
   * Adapters should enrich the returned context before calling exec().
   */
  public newCtx(protocol?: string): TUserCtx {
    // Build default user (anonymous)
    const user = {
      kind: "user" as const,
      id: "none",
      role: ["none" as const],
      scope: [],
      handle: null,
    };

    // Build ctx with defaults (timing and tracing set in exec())
    const ctx: TDefaultCtx = {
      id: "PENDING", // Set in exec()
      req: {
        data: {},
        route: {
          // op: undefined,  // Adapter will set - omit to satisfy exactOptionalPropertyTypes
          raw: "PENDING", // Adapter will set
          pattern: "PENDING", // Router will set in exec
        } as TDefaultCtx["req"]["route"],
        transport: {
          protocol: protocol || "unknown", // For logging only
          raw: null,
        },
      },
      res: {
        code: "OK",
        msg: "OK",
        data: {},
      },
      err: null,
      user,
      meta: {
        serviceName: this.instance.SERVICE_NAME,
        instance: {
          id: this.instance.ID,
          createdAt: this.instance.CREATED_AT,
          seq: -1, // Set in exec()
          inflight: -1, // Set in exec()
          cpu: -1, // Set in exec()
          mem: -1, // Set in exec()
        },
        ts: {
          in: -1, // Set in exec()
          clientIn: -1, // Set in exec()
          ingressIn: -1, // Set in exec()
          out: -1,
          execTime: -1,
          owd: -1, // Set in exec()
        },
        monitor: {
          traceId: "PENDING", // Set in exec()
          spanId: "PENDING", // Set in exec()
        },
        log: {
          stdout: [],
          db: [],
        },
      },
      locals: {},
    };

    return ctx as TUserCtx;
  }

  async exec(ctx: TUserCtx): Promise<TUserCtx> {
    // Seal hooks on first exec - no more modifications allowed
    this.sealed = true;

    return await execImpl(
      ctx,
      this.exactRoutes,
      this.paramRoutes,
      this.hooks,
      this.instance
    );
  }

  /**
   * Creates a route builder scope with an additional segment prefix.
   * This is build-time only (used for route registration).
   */
  public route(...segments: string[]): TRouteBuilder<TUserCtx> {
    if (segments.length === 0) {
      throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
    }
    for (const segment of segments) {
      if (typeof segment !== "string" || segment.length === 0) {
        throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
      }
    }
    const segmentVariants = segments.map((segment) => [segment]);
    return new RouteBuilder<TUserCtx>(this, segmentVariants, []);
  }

  /**
   * Creates a root route builder scope with middleware applied globally.
   *
   * Example:
   * `router.via(auth).route("GET /health").to(handler)`
   */
  public via(
    ...fns: Array<(ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>>
  ): Pick<TRouteBuilder<TUserCtx>, "route" | "via"> {
    return new RouteBuilder<TUserCtx>(this, [[]], []).via(...fns) as Pick<
      TRouteBuilder<TUserCtx>,
      "route" | "via"
    >;
  }

  // Internal access for RouteBuilder via Symbol
  [INTERNAL_ROUTER_ACCESS] = {
    registerRouteFrom: this.registerRouteFrom.bind(this),
  };

  /**
   * Registers a route from a builder scope.
   * Internal entrypoint used by `RouteBuilder.to()`.
   */
  private registerRouteFrom(
    segments: string[],
    middleware: Array<(ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>>,
    handler: (ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>
  ): void {
    if (segments.length === 0) {
      throw ctxRouterErr.router.MISSING_SEGMENTS();
    }

    if (!handler) {
      throw ctxRouterErr.router.MISSING_HANDLER();
    }

    // Compose: middleware chain → handler
    const mwChain = [...middleware];

    const composedHandler = async (ctx: TUserCtx): Promise<TUserCtx> => {
      let result = ctx;
      for (const mw of mwChain) {
        result = await mw(result);
      }
      return handler(result);
    };

    // 1. Detect HTTP grammar and extract op + route pattern parts
    const { httpOp, patternSegments } = this.analyzeSegments(segments);

    // 2. Build pattern by strict concatenation (no implicit delimiters)
    const pattern = this.buildPattern(patternSegments);
    if (pattern.length === 0) {
      throw ctxRouterErr.router.EMPTY_ROUTE_PATTERN({ data: { segments } });
    }
    const matcher = pathMatch(pattern, { decode: decodeURIComponent });

    // 3. Build primary route
    const route: TRoute<TUserCtx> = {
      pattern,
      matcher,
      handler: composedHandler,
    };

    if (httpOp) {
      route.op = httpOp;
    }

    this.addRouteToStorage(route, segments);
  }

  /**
   * Analyzes segments to detect HTTP grammar (method keywords).
   *
   * Allowed segment forms:
   * - "pattern"          (no whitespace; taken exactly as provided)
   * - "METHOD"           (method-only segment, sets the route op)
   * - "METHOD pattern"   (method token must lead; single pattern token)
   *
   * Anything else throws MALFORMED_SEGMENT. A second method token anywhere
   * in the chain throws MULTIPLE_HTTP_METHODS. Method tokens are matched
   * case-insensitively and normalized to uppercase.
   */
  private analyzeSegments(segments: string[]): {
    httpOp?: string;
    patternSegments: string[];
  } {
    const httpMethods = new Set([
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ]);
    const isMethod = (token: string): boolean =>
      httpMethods.has(token.toUpperCase());

    let httpOp: string | undefined;
    const setOp = (token: string): void => {
      if (httpOp) {
        throw ctxRouterErr.router.MULTIPLE_HTTP_METHODS({
          data: { segments },
        });
      }
      httpOp = token.toUpperCase();
    };

    const patternSegments: string[] = [];

    for (const seg of segments) {
      if (!/\s/.test(seg)) {
        // Single token: method-only segment or literal pattern piece
        if (isMethod(seg)) {
          setOp(seg);
        } else {
          patternSegments.push(seg);
        }
        continue;
      }

      const tokens = seg.trim().split(/\s+/);
      const [first, second] = tokens;

      if (tokens.length === 1 && first && isMethod(first)) {
        // Method token with stray surrounding whitespace
        setOp(first);
        continue;
      }

      if (
        tokens.length === 2 &&
        first &&
        second &&
        isMethod(first) &&
        !isMethod(second)
      ) {
        setOp(first);
        patternSegments.push(second);
        continue;
      }

      // Whitespace in any other shape is a programmer error
      throw ctxRouterErr.router.MALFORMED_SEGMENT({ data: { segment: seg } });
    }

    return httpOp ? { httpOp, patternSegments } : { patternSegments };
  }

  /**
   * Builds a pattern by strict segment concatenation.
   */
  private buildPattern(segments: string[]): string {
    return segments.join("");
  }

  /**
   * Adds a route to storage (exact or param).
   * Registering the same op + pattern twice throws DUPLICATE_ROUTE.
   */
  private addRouteToStorage(route: TRoute<TUserCtx>, segments: string[]): void {
    const entry: TRouteEntry<TUserCtx> = {
      route,
      segments,
      specificity: this.getParamRouteSpecificity(route.pattern),
    };

    // Check if pattern has params
    const hasParams = route.pattern.includes(":");

    if (hasParams) {
      const duplicate = this.paramRoutes.some(
        (e) => e.route.pattern === route.pattern && e.route.op === route.op
      );
      if (duplicate) {
        throw ctxRouterErr.router.DUPLICATE_ROUTE({
          data: { op: route.op ?? null, pattern: route.pattern },
        });
      }

      // Store in paramRoutes array for regex matching (ordered by specificity)
      this.paramRoutes.push(entry);
      this.paramRoutes.sort((a, b) => this.compareParamRouteSpecificity(a, b));
    } else {
      // Store in exactRoutes map for O(1) lookup
      // Key format: "op\0pattern", or plain "pattern" for op-less (wildcard) routes
      const key = route.op
        ? `${route.op}${EXACT_KEY_DELIMITER}${route.pattern}`
        : route.pattern;

      if (this.exactRoutes.has(key)) {
        throw ctxRouterErr.router.DUPLICATE_ROUTE({
          data: { op: route.op ?? null, pattern: route.pattern },
        });
      }

      this.exactRoutes.set(key, entry);
    }
  }

  private getParamRouteSpecificity(pattern: string): {
    staticCount: number;
    paramCount: number;
    len: number;
  } {
    const paramMatches = pattern.match(/:[A-Za-z0-9_]+/g) ?? [];
    const paramCount = paramMatches.length;
    const staticPattern = pattern.replace(/:[A-Za-z0-9_]+/g, "");
    const staticCount = staticPattern.length;

    return { staticCount, paramCount, len: pattern.length };
  }

  /**
   * Sort param routes for predictable matching (Fastify-like):
   * - more static segments win
   * - fewer params win
   * - longer patterns win
   * - stable tie-breakers (pattern, then op)
   */
  private compareParamRouteSpecificity(
    a: TRouteEntry<TUserCtx>,
    b: TRouteEntry<TUserCtx>
  ): number {
    const aSpec = a.specificity;
    const bSpec = b.specificity;

    if (aSpec.staticCount !== bSpec.staticCount) {
      return bSpec.staticCount - aSpec.staticCount; // desc
    }
    if (aSpec.paramCount !== bSpec.paramCount) {
      return aSpec.paramCount - bSpec.paramCount; // asc
    }
    if (aSpec.len !== bSpec.len) {
      return bSpec.len - aSpec.len; // desc
    }

    const patternCmp = a.route.pattern.localeCompare(b.route.pattern);
    if (patternCmp !== 0) return patternCmp;

    return (a.route.op ?? "").localeCompare(b.route.op ?? "");
  }
}
