import { match as pathMatch } from "path-to-regexp";
import { defaultHookOnExecBefore } from "../defaultHook/hook.onExecBefore";
import { defaultHookOnExecError } from "../defaultHook/hook.onExecError";
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

// No-op hook for defaults
const noop = async () => {};

// Factory for creating default hooks
function createDefaultHooks<TContext extends TDefaultCtx>(
  logLevel: LogLevel
): THooks<TContext> {
  return {
    onExecBefore: defaultHookOnExecBefore(logLevel),
    onExecAfter: noop,
    onExecError: defaultHookOnExecError,
    onExecFinally: noop,
  };
}

export class CtxRouter<TContext extends TDefaultCtx> {
  // Segment tracking for scoped router
  private segments: string[] = [];

  // Middleware chain for this router scope
  private middleware: Array<(ctx: TContext) => TContext | Promise<TContext>> =
    [];

  // Handler for this route (set by to())
  private handler: ((ctx: TContext) => TContext | Promise<TContext>) | null =
    null;

  // Route storage: exact matches (O(1)) and param routes (regex)
  public exactRoutes = new Map<string, TRouteEntry<TContext>>();
  public paramRoutes: TRouteEntry<TContext>[] = [];

  // Hook state (shared across scoped routers)
  private hooks: THooks<TContext>;

  // Sealing flag - prevents hook modification after first exec
  private sealed = false;

  // Public hook DSL (created once, stable reference)
  public readonly hook: THookDSL<TContext, CtxRouter<TContext>>;

  public logLevel: LogLevel;
  public statsEnabled: boolean;

  // Router-level INSTANCE
  private readonly instance: TRouterInstance;

  // Public readonly getter
  public get INSTANCE() {
    return { ...this.instance };
  }

  constructor(config: CtxRouterConfig = {}, sharedHooks?: THooks<TContext>) {
    this.logLevel = config.logLevel ?? "standard";
    this.statsEnabled = config.statsEnabled ?? true;
    this.instance = createRouterInstance();

    // Use shared hooks if provided (from parent via .on()), else create new
    this.hooks = sharedHooks ?? createDefaultHooks(this.logLevel);

    // Create hook DSL once (stable reference, no getter)
    this.hook = this.createHookDSL();
  }

  // Prevents hook modification after first exec
  private assertNotSealed(): void {
    if (this.sealed) {
      throw new Error("Hooks must be registered during startup, before exec()");
    }
  }

  // Creates the hook DSL object (called once in constructor)
  private createHookDSL(): THookDSL<TContext, CtxRouter<TContext>> {
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
  public newCtx(protocol?: string): TContext {
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

    return ctx as TContext;
  }

  async exec(ctx: TContext): Promise<TContext> {
    // Seal hooks on first exec - no more modifications allowed
    this.sealed = true;

    return await execImpl(
      ctx,
      this, // Pass router instance instead of routes array
      this.hooks,
      this.instance,
      this.statsEnabled
    );
  }

  /**
   * Creates a scoped router with an additional segment prefix.
   * Returns a new router instance that shares storage and hooks with the parent.
   */
  public route(
    segment: string
  ): Pick<CtxRouter<TContext>, "route" | "via" | "to"> {
    if (typeof segment !== "string" || segment.length === 0) {
      throw new Error("Router.on() requires a non-empty string segment");
    }

    // Create new scoped router with shared hooks
    const scoped = new CtxRouter<TContext>(
      { logLevel: this.logLevel, statsEnabled: this.statsEnabled },
      this.hooks // Pass shared hooks state
    );

    // Copy segment chain and middleware
    scoped.segments = [...this.segments, segment];
    scoped.middleware = [...this.middleware];

    // Share storage (routes registered on any scope go to same storage)
    scoped.exactRoutes = this.exactRoutes;
    scoped.paramRoutes = this.paramRoutes;

    return scoped;
  }

  /**
   * Adds middleware to execute before the handler.
   * Middleware runs in order: first via() → last via() → handler.
   * Chainable and supports variadic args.
   */
  public via(
    ...fns: Array<(ctx: TContext) => TContext | Promise<TContext>>
  ): Pick<CtxRouter<TContext>, "route" | "via" | "to"> {
    for (const fn of fns) {
      if (typeof fn !== "function") {
        throw new Error("Router.via() requires function arguments");
      }
      this.middleware.push(fn);
    }
    return this;
  }

  /**
   * Registers the handler for this route. Terminal - no chaining.
   * Middleware (via) runs first, then this handler.
   * Returns void.
   */
  public to(handler: (ctx: TContext) => TContext | Promise<TContext>): void {
    if (typeof handler !== "function") {
      throw new Error("Router.to() requires a function");
    }
    this.handler = handler;
    this.registerRoute();
  }

  /**
   * Composes middleware + handler and registers the route.
   */
  private registerRoute(): void {
    if (this.segments.length === 0) {
      throw new Error(
        "Cannot register handler without segments. Use .route(segment) first."
      );
    }

    if (!this.handler) {
      throw new Error(
        "Cannot register route without handler. Use .to(handler)."
      );
    }

    // Compose: middleware chain → handler
    const mwChain = [...this.middleware];
    const handler = this.handler;

    const composedHandler = async (ctx: TContext): Promise<TContext> => {
      let result = ctx;
      for (const mw of mwChain) {
        result = await mw(result);
      }
      return handler(result);
    };

    // 1. Detect HTTP grammar and build patterns
    const { hasHttp, httpOp, nonHttpSegments } = this.analyzeSegments(
      this.segments
    );

    // 2. Build primary pattern (always) - uses "." separator
    const pattern = this.buildPattern(nonHttpSegments, false);
    const matcher = pathMatch(pattern, { decode: decodeURIComponent });

    // 3. Build primary route
    const route: TRoute<TContext> = {
      pattern,
      separator: ".",
      matcher,
      handler: composedHandler,
    } as TRoute<TContext>;

    if (hasHttp && httpOp) {
      route.op = httpOp;
    }

    this.addRouteToStorage(route, this.segments);

    // 4. If HTTP grammar detected, register HTTP route too (uses "/" separator)
    if (hasHttp && httpOp) {
      const httpPattern = this.buildHttpPattern(nonHttpSegments);
      const httpMatcher = pathMatch(httpPattern, {
        decode: decodeURIComponent,
      });

      const httpRoute: TRoute<TContext> = {
        op: httpOp,
        pattern: httpPattern,
        separator: "/",
        matcher: httpMatcher,
        handler: composedHandler,
      };

      this.addRouteToStorage(httpRoute, this.segments);
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
  private addRouteToStorage(route: TRoute<TContext>, segments: string[]): void {
    const entry: TRouteEntry<TContext> = { route, segments };

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
