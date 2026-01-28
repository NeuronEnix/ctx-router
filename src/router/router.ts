import { match as pathMatch } from "path-to-regexp";
import { TDefaultCtx } from "../core";
import {
  TRoute,
  TRouteEntry,
  THooks,
  THookDSL,
  LogLevel,
  CtxRouterConfig,
} from "./types";
import { TRouterInstance, createRouterInstance } from "./instance";
import { exec as execImpl } from "./lifecycle.exec";
import { ctxRouterErr } from "./error";
import { RouteBuilder, TRouteBuilder } from "./builder";

// Factory for creating default hooks
function createDefaultHooks<
  TUserContext extends TDefaultCtx,
>(): THooks<TUserContext> {
  return {};
}

export class CtxRouter<TUserContext extends TDefaultCtx> {
  // Route storage: exact matches (O(1)) and param routes (regex)
  public exactRoutes = new Map<string, TRouteEntry<TUserContext>>();
  public paramRoutes: TRouteEntry<TUserContext>[] = [];

  // Hook state (per router instance)
  private hooks: THooks<TUserContext>;

  // Sealing flag - prevents hook modification after first exec
  private sealed = false;

  // Public hook DSL (created once, stable reference)
  public readonly hook: THookDSL<TUserContext, CtxRouter<TUserContext>>;

  public logLevel: LogLevel;

  // Router-level INSTANCE
  private readonly instance: TRouterInstance;

  // Public readonly getter
  public get INSTANCE() {
    return { ...this.instance };
  }

  constructor(config: CtxRouterConfig = {}) {
    this.logLevel = config.logLevel ?? "standard";
    this.instance = createRouterInstance(config.serviceName);

    // Always create hooks for this router instance
    this.hooks = createDefaultHooks();

    // Create hook DSL once (stable reference, no getter)
    this.hook = this.createHookDSL();
  }

  // Prevents hook modification after first exec
  private assertNotSealed(): void {
    if (this.sealed) {
      throw ctxRouterErr.hook.HOOKS_ALREADY_SEALED();
    }
  }

  // Creates the hook DSL object (called once in constructor)
  private createHookDSL(): THookDSL<TUserContext, CtxRouter<TUserContext>> {
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
  public newCtx(protocol?: string): TUserContext {
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

    return ctx as TUserContext;
  }

  async exec(ctx: TUserContext): Promise<TUserContext> {
    // Seal hooks on first exec - no more modifications allowed
    this.sealed = true;

    return await execImpl(
      ctx,
      this, // Pass router instance instead of routes array
      this.hooks,
      this.instance
    );
  }

  /**
   * Creates a route builder scope with an additional segment prefix.
   * This is build-time only (used for route registration).
   */
  public route(segment: string): TRouteBuilder<TUserContext> {
    if (typeof segment !== "string" || segment.length === 0) {
      throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
    }
    return new RouteBuilder<TUserContext>(this, [segment], []);
  }

  /**
   * Registers a route from a builder scope.
   * Internal entrypoint used by `RouteBuilder.to()`.
   */
  public registerRouteFrom(
    segments: string[],
    middleware: Array<
      (ctx: TUserContext) => TUserContext | Promise<TUserContext>
    >,
    handler: (ctx: TUserContext) => TUserContext | Promise<TUserContext>
  ): void {
    if (segments.length === 0) {
      throw ctxRouterErr.router.MISSING_SEGMENTS();
    }

    if (!handler) {
      throw ctxRouterErr.router.MISSING_HANDLER();
    }

    // Compose: middleware chain → handler
    const mwChain = [...middleware];

    const composedHandler = async (
      ctx: TUserContext
    ): Promise<TUserContext> => {
      let result = ctx;
      for (const mw of mwChain) {
        result = await mw(result);
      }
      return handler(result);
    };

    // 1. Detect HTTP grammar and build patterns
    const { hasHttp, httpOp, nonHttpSegments } = this.analyzeSegments(segments);

    // 2. Build primary pattern (always)
    const pattern = this.buildPattern(nonHttpSegments, false);
    const matcher = pathMatch(pattern, { decode: decodeURIComponent });

    // 3. Build primary route
    const route: TRoute<TUserContext> = {
      pattern,
      matcher,
      handler: composedHandler,
    };

    if (hasHttp && httpOp) {
      route.op = httpOp;
    }

    this.addRouteToStorage(route, segments);

    // 4. If HTTP grammar detected, register HTTP route too
    if (hasHttp && httpOp) {
      const httpPattern = this.buildHttpPattern(nonHttpSegments);
      const httpMatcher = pathMatch(httpPattern, {
        decode: decodeURIComponent,
      });

      const httpRoute: TRoute<TUserContext> = {
        op: httpOp,
        pattern: httpPattern,
        matcher: httpMatcher,
        handler: composedHandler,
      };

      this.addRouteToStorage(httpRoute, segments);
    }
  }

  /**
   * Analyzes segments to detect HTTP grammar (method keywords).
   * Returns HTTP method, flag, and non-HTTP segments.
   */
  private analyzeSegments(segments: string[]): {
    hasHttp: boolean;
    httpOp?: string;
    nonHttpSegments: string[];
  } {
    const httpMethods = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    const httpSegments: string[] = [];
    const nonHttpSegments: string[] = [];

    for (const seg of segments) {
      // Check if segment contains HTTP grammar
      const parts = seg.split(/\s+/);
      const hasMethod = parts.some((p) =>
        httpMethods.includes(p.toUpperCase())
      );

      if (hasMethod) {
        httpSegments.push(
          ...parts.filter((p) => httpMethods.includes(p.toUpperCase()))
        );
        // Strip leading slashes from path segments when HTTP grammar is present
        const pathParts = parts
          .filter((p) => !httpMethods.includes(p.toUpperCase()))
          .map((p) => (p.startsWith("/") ? p.substring(1) : p))
          .filter((p) => p.length > 0);
        nonHttpSegments.push(...pathParts);
      } else {
        nonHttpSegments.push(seg);
      }
    }

    const result: {
      hasHttp: boolean;
      httpOp?: string;
      nonHttpSegments: string[];
    } = {
      hasHttp: httpSegments.length > 0,
      nonHttpSegments,
    };

    // Only add httpOp if it exists
    if (httpSegments[0]) {
      result.httpOp = httpSegments[0];
    }

    return result;
  }

  /**
   * Builds a pattern from segments using specified separator.
   */
  private buildPattern(segments: string[], isHttp: boolean): string {
    const separator = isHttp ? "/" : ".";
    return segments.join(separator);
  }

  /**
   * Builds an HTTP pattern with leading slash.
   */
  private buildHttpPattern(segments: string[]): string {
    const pattern = this.buildPattern(segments, true);
    return pattern.startsWith("/") ? pattern : `/${pattern}`;
  }

  /**
   * Adds a route to storage (exact or param).
   */
  private addRouteToStorage(
    route: TRoute<TUserContext>,
    segments: string[]
  ): void {
    const entry: TRouteEntry<TUserContext> = { route, segments };

    // Check if pattern has params
    const hasParams = route.pattern.includes(":");

    if (hasParams) {
      // Store in paramRoutes array for regex matching
      this.paramRoutes.push(entry);
    } else {
      // Store in exactRoutes map for O(1) lookup
      // Key format: "op:pattern" or ":pattern" (if no op)
      const key = route.op
        ? `${route.op}:${route.pattern}`
        : `:${route.pattern}`;

      this.exactRoutes.set(key, entry);
    }
  }
}
