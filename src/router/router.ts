import { match as pathMatch } from "path-to-regexp";
import { defaultHookOnExecBefore } from "../defaultHook/hook.onExecBefore";
import { defaultHookOnExecError } from "../defaultHook/hook.onExecError";
import { TDefaultCtx } from "../core";
import {
  TRoute,
  TRouteEntry,
  THooks,
  LogLevel,
  CtxRouterConfig,
} from "./types";
import { TRouterInstance, createRouterInstance } from "./instance";
import { exec as execImpl } from "./lifecycle.exec";

export class CtxRouter<TContext extends TDefaultCtx> {
  // Segment tracking for scoped router
  private segments: string[] = [];

  // Route storage: exact matches (O(1)) and param routes (regex)
  public exactRoutes = new Map<string, TRouteEntry<TContext>>();
  public paramRoutes: TRouteEntry<TContext>[] = [];

  private hooks: THooks<TContext>;
  public logLevel: LogLevel;
  public statsEnabled: boolean;

  // Router-level INSTANCE
  private readonly instance: TRouterInstance;

  // Public readonly getter
  public get INSTANCE() {
    return { ...this.instance };
  }

  constructor(config: CtxRouterConfig = {}) {
    this.logLevel = config.logLevel ?? "standard";
    this.statsEnabled = config.statsEnabled ?? true;
    this.instance = createRouterInstance();
    this.hooks = {
      // Exec lifecycle (outer)
      onExecBefore: defaultHookOnExecBefore(this.logLevel),
      onExecAfter: async (ctx) => ctx,
      onExecError: defaultHookOnExecError,
      onExecFinally: async (ctx) => ctx,
      // Handler lifecycle (inner)
      onHandlerBefore: async (ctx) => ctx,
      onHandlerAfter: async (ctx) => ctx,
      onHandlerError: async (ctx) => ctx,
      onHandlerFinally: async (ctx) => ctx,
    };
  }

  // Exec lifecycle hook setters
  hookOnExecBefore(handler: THooks<TContext>["onExecBefore"]) {
    this.hooks.onExecBefore = handler;
  }

  hookOnExecAfter(handler: THooks<TContext>["onExecAfter"]) {
    this.hooks.onExecAfter = handler;
  }

  /**
   * Creates a new context with default values.
   * Does NOT increment inflight or set timing - that happens in exec().
   * Adapters should enrich the returned context before calling exec().
   */
  public createCtx(protocol?: string): TContext {
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
    };

    return ctx as TContext;
  }

  async exec(ctx: TContext): Promise<TContext> {
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
   * Returns a new router instance that shares storage with the parent.
   */
  public on(segment: string): CtxRouter<TContext> {
    if (typeof segment !== "string" || segment.length === 0) {
      throw new Error("Router.on() requires a non-empty string segment");
    }

    // Create new scoped router with accumulated segments
    const scoped = new CtxRouter<TContext>({
      logLevel: this.logLevel,
      statsEnabled: this.statsEnabled,
    });

    // Copy segment chain
    scoped.segments = [...this.segments, segment];

    // Share storage (routes registered on any scope go to same storage)
    scoped.exactRoutes = this.exactRoutes;
    scoped.paramRoutes = this.paramRoutes;

    // Share hooks
    scoped.hooks = this.hooks;

    return scoped;
  }

  /**
   * Registers a handler for the accumulated segment prefix.
   * Analyzes segments for HTTP grammar and creates appropriate routes.
   */
  public handle(handler: (ctx: TContext) => Promise<TContext>): void {
    if (typeof handler !== "function") {
      throw new Error("Router.handle() requires a handler function");
    }

    if (this.segments.length === 0) {
      throw new Error(
        "Cannot register handler without segments. Use .on(segment) first."
      );
    }

    // 1. Detect HTTP grammar and build patterns
    const { hasHttp, httpOp, nonHttpSegments } = this.analyzeSegments(
      this.segments
    );

    // 2. Build primary pattern (always) - uses "." separator
    const pattern = this.buildPattern(nonHttpSegments, false);
    const matcher = pathMatch(pattern, { decode: decodeURIComponent });

    // 3. Register primary pattern route
    const route: TRoute<TContext> = {
      pattern,
      separator: ".",
      matcher,
      handler,
    } as TRoute<TContext>;

    // Only add op if HTTP grammar is present
    if (hasHttp && httpOp) {
      route.op = httpOp;
    }

    this.registerRoute(route, this.segments);

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
        handler,
      };

      this.registerRoute(httpRoute, this.segments);
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
   * Registers a route in either exact or param storage.
   */
  private registerRoute(route: TRoute<TContext>, segments: string[]): void {
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

  hookOnExecError(handler: THooks<TContext>["onExecError"]) {
    this.hooks.onExecError = handler;
  }

  hookOnExecFinally(handler: THooks<TContext>["onExecFinally"]) {
    this.hooks.onExecFinally = handler;
  }

  // Handler lifecycle hook setters
  hookOnHandlerBefore(handler: THooks<TContext>["onHandlerBefore"]) {
    this.hooks.onHandlerBefore = handler;
  }

  hookOnHandlerAfter(handler: THooks<TContext>["onHandlerAfter"]) {
    this.hooks.onHandlerAfter = handler;
  }

  hookOnHandlerError(handler: THooks<TContext>["onHandlerError"]) {
    this.hooks.onHandlerError = handler;
  }

  hookOnHandlerFinally(handler: THooks<TContext>["onHandlerFinally"]) {
    this.hooks.onHandlerFinally = handler;
  }
}
