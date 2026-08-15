import { match as pathMatch, parse as pathParse } from "path-to-regexp";
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
import { exec as execImpl, assertCtxReturn } from "./lifecycle.exec";
import { ctxRouterErr } from "./error";
import { RouteBuilder, TRouteBuilder } from "./builder";

// Symbol for internal access from RouteBuilder
export const INTERNAL_ROUTER_ACCESS = Symbol("CtxRouter.internal");

// Dynamic pattern tokens (path-to-regexp v8 grammar):
// `:name` matches a single segment, `*name` matches one or more segments.
// Used with String#match / String#replace only - both reset lastIndex, so
// sharing these global regexes across calls is safe.
const DYNAMIC_TOKEN_RE = /[:*][A-Za-z0-9_]+/g;
const SPLAT_TOKEN_RE = /\*[A-Za-z0-9_]+/g;
// `{...}` optional-group delimiters are grammar, not literal path characters.
const GROUP_DELIMITER_RE = /[{}]/g;

// Factory for creating default hooks
function createDefaultHooks<TUserCtx extends TDefaultCtx>(): THooks<TUserCtx> {
  return {};
}

/**
 * A route that passed every registration check but has not been stored yet.
 * `RouteBuilder.to()` prepares all of its variants before committing any of
 * them, so a failure on variant N never leaves variants 1..N-1 registered.
 */
type TPreparedRoute<TUserCtx extends TDefaultCtx> = {
  entry: TRouteEntry<TUserCtx>;
  // Dynamic patterns (params, splats, optional groups) go to paramRoutes;
  // purely static ones go to the exact map.
  isDynamic: boolean;
  // Map key when static; batch-uniqueness key in both cases.
  storageKey: string;
};

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
    registerRoutesFrom: this.registerRoutesFrom.bind(this),
  };

  /**
   * Registers every segment variant of a builder scope as one atomic batch.
   * Internal entrypoint used by `RouteBuilder.to()`.
   *
   * All variants are validated (grammar, pattern, duplicates against both
   * existing storage and the rest of the batch) before ANY of them is stored,
   * so a rejected variant can never leave the router half-registered.
   */
  private registerRoutesFrom(
    segmentVariants: string[][],
    middleware: Array<(ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>>,
    handler: (ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>
  ): void {
    if (!handler) {
      throw ctxRouterErr.router.MISSING_HANDLER();
    }

    // One composed pipeline shared by every variant - it reads the matched
    // pattern off the ctx at runtime, so nothing in it is variant-specific.
    const composedHandler = this.composeHandler(middleware, handler);

    const prepared: Array<TPreparedRoute<TUserCtx>> = [];
    // Keys claimed by earlier variants of THIS batch, so two variants that
    // collapse to the same op + pattern are rejected just like a collision
    // with an already-registered route. One set covers both storages: a
    // pattern is statically either dynamic or not, so the two key spaces
    // can never overlap.
    const claimedKeys = new Set<string>();

    for (const segments of segmentVariants) {
      const route = this.prepareRoute(segments, composedHandler);

      if (
        claimedKeys.has(route.storageKey) ||
        this.isAlreadyRegistered(route)
      ) {
        throw ctxRouterErr.router.DUPLICATE_ROUTE({
          data: {
            op: route.entry.route.op ?? null,
            pattern: route.entry.route.pattern,
          },
        });
      }

      claimedKeys.add(route.storageKey);
      prepared.push(route);
    }

    // Everything validated - commit the batch.
    let addedDynamic = false;
    for (const route of prepared) {
      if (route.isDynamic) {
        this.paramRoutes.push(route.entry);
        addedDynamic = true;
      } else {
        this.exactRoutes.set(route.storageKey, route.entry);
      }
    }
    if (addedDynamic) {
      this.paramRoutes.sort((a, b) => this.compareParamRouteSpecificity(a, b));
    }
  }

  /**
   * Composes the middleware chain and handler into a single pipeline.
   */
  private composeHandler(
    middleware: Array<(ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>>,
    handler: (ctx: TUserCtx) => TUserCtx | Promise<TUserCtx>
  ): (ctx: TUserCtx) => Promise<TUserCtx> {
    const mwChain = [...middleware];

    // Every step's return value is validated so an accidental `undefined`
    // (a handler that forgot `return ctx`) can never clobber the live ctx
    // reference - see assertCtxReturn in lifecycle.exec.ts.
    const composedHandler = async (ctx: TUserCtx): Promise<TUserCtx> => {
      let result = ctx;
      for (const [index, mw] of mwChain.entries()) {
        result = assertCtxReturn<TUserCtx>(await mw(result), {
          stage: "middleware",
          index,
          fn: mw.name || "anonymous",
          pattern: ctx.req.route.pattern,
        });
      }
      return assertCtxReturn<TUserCtx>(await handler(result), {
        stage: "handler",
        fn: handler.name || "anonymous",
        pattern: ctx.req.route.pattern,
      });
    };

    return composedHandler;
  }

  /**
   * Validates one segment variant and builds its storage entry.
   * Throws on any grammar problem; performs NO duplicate check and stores
   * nothing - the caller decides when the whole batch may be committed.
   */
  private prepareRoute(
    segments: string[],
    composedHandler: (ctx: TUserCtx) => Promise<TUserCtx>
  ): TPreparedRoute<TUserCtx> {
    if (segments.length === 0) {
      throw ctxRouterErr.router.MISSING_SEGMENTS();
    }

    // 1. Detect HTTP grammar and extract op + route pattern parts
    const { httpOp, patternSegments } = this.analyzeSegments(segments);

    // 2. Build pattern by strict concatenation (no implicit delimiters)
    const pattern = this.buildPattern(patternSegments);
    if (pattern.length === 0) {
      throw ctxRouterErr.router.EMPTY_ROUTE_PATTERN({ data: { segments } });
    }

    // 3. Tokenize once and reuse: path-to-regexp's own parser decides whether
    // the pattern is dynamic, so every construct it understands (`:param`,
    // `*splat`, `{optional group}`) is routed to the matcher rather than being
    // mistaken for a literal string. Only a lone text token is truly static.
    const tokenData = pathParse(pattern);
    const firstToken = tokenData.tokens[0];
    const isDynamic =
      tokenData.tokens.length !== 1 || firstToken?.type !== "text";
    const matcher = pathMatch(tokenData, { decode: decodeURIComponent });

    // 4. Build primary route
    const route: TRoute<TUserCtx> = {
      pattern,
      matcher,
      handler: composedHandler,
    };

    if (httpOp) {
      route.op = httpOp;
    }

    // Key format: "op\0pattern", or plain "pattern" for op-less (wildcard)
    // routes. Stores static patterns; also identifies a variant within a batch.
    const storageKey = route.op
      ? `${route.op}${EXACT_KEY_DELIMITER}${pattern}`
      : pattern;

    return {
      entry: {
        route,
        segments,
        specificity: this.getParamRouteSpecificity(pattern),
      },
      isDynamic,
      storageKey,
    };
  }

  /**
   * Whether a prepared route collides with one already in storage.
   */
  private isAlreadyRegistered(route: TPreparedRoute<TUserCtx>): boolean {
    if (!route.isDynamic) return this.exactRoutes.has(route.storageKey);
    return this.paramRoutes.some(
      (e) =>
        e.route.pattern === route.entry.route.pattern &&
        e.route.op === route.entry.route.op
    );
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

  private getParamRouteSpecificity(pattern: string): {
    staticCount: number;
    paramCount: number;
    splatCount: number;
    len: number;
  } {
    // `:name` captures one segment, `*name` captures many - both are dynamic
    // tokens, so neither contributes to the static character count. The `{`/`}`
    // of an optional group are grammar too; only the literal text inside the
    // group counts (`/opt{/x}` has 6 static chars: "/opt" + "/x").
    const paramCount = (pattern.match(DYNAMIC_TOKEN_RE) ?? []).length;
    const splatCount = (pattern.match(SPLAT_TOKEN_RE) ?? []).length;
    const staticPattern = pattern
      .replace(DYNAMIC_TOKEN_RE, "")
      .replace(GROUP_DELIMITER_RE, "");
    const staticCount = staticPattern.length;

    return { staticCount, paramCount, splatCount, len: pattern.length };
  }

  /**
   * Sort param routes for predictable matching (Fastify-like):
   * - more static characters win
   * - fewer dynamic tokens win
   * - fewer splats win (a `*splat` swallows many segments, so it is strictly
   *   more generic than a `:param` at the same token count)
   * - longer patterns win
   * - op-specific routes win over op-less (wildcard) routes, mirroring the
   *   exact-route rule: an op-less route matches ANY op, so if it sorted first
   *   it would permanently shadow an equally specific op-specific route
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
    if (aSpec.splatCount !== bSpec.splatCount) {
      return aSpec.splatCount - bSpec.splatCount; // asc
    }
    if (aSpec.len !== bSpec.len) {
      return bSpec.len - aSpec.len; // desc
    }

    // Op-specific before op-less. An op-less route is a wildcard that matches
    // every op, so it must never be tried before an equally specific route
    // that was registered for this exact op.
    const aHasOp = a.route.op !== undefined;
    const bHasOp = b.route.op !== undefined;
    if (aHasOp !== bHasOp) return aHasOp ? -1 : 1;

    const patternCmp = a.route.pattern.localeCompare(b.route.pattern);
    if (patternCmp !== 0) return patternCmp;

    return (a.route.op ?? "").localeCompare(b.route.op ?? "");
  }
}
