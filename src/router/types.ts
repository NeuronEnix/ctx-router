import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";

export type TRoute<TContext extends TDefaultCtx> = {
  op?: string; // Optional: HTTP method, event name, etc.
  pattern: string; // Pattern with :params (identity)
  separator: "." | "/"; // Track separator for logging/debugging
  matcher: MatchFunction<object>; // Compiled regex from path-to-regexp
  handler: (ctx: TContext) => Promise<TContext>;
};

export type TRouteEntry<TContext extends TDefaultCtx> = {
  route: TRoute<TContext>;
  segments: string[]; // Track original segments for logging
};

// Side-effect hooks - mutate ctx directly, no return needed
export type THooks<TContext extends TDefaultCtx> = {
  // Exec lifecycle hooks (outer) - wraps routing + handler
  onExecBefore: (ctx: TContext) => void | Promise<void>;
  onExecAfter: (ctx: TContext) => void | Promise<void>;
  onExecError: (ctx: TContext, error: Error | unknown) => void | Promise<void>;
  onExecFinally: (ctx: TContext) => void | Promise<void>;

  // Handler lifecycle hooks (inner) - wraps user's business logic
  onHandlerBefore: (ctx: TContext) => void | Promise<void>;
  onHandlerAfter: (ctx: TContext) => void | Promise<void>;
  onHandlerError: (
    ctx: TContext,
    error: Error | unknown
  ) => void | Promise<void>;
  onHandlerFinally: (ctx: TContext) => void | Promise<void>;
};

// Hook DSL type for fluent API (forward reference resolved by CtxRouter import)
export type THookDSL<TContext extends TDefaultCtx, TRouter> = {
  onExec: {
    before(fn: THooks<TContext>["onExecBefore"]): TRouter;
    after(fn: THooks<TContext>["onExecAfter"]): TRouter;
    error(fn: THooks<TContext>["onExecError"]): TRouter;
    finally(fn: THooks<TContext>["onExecFinally"]): TRouter;
  };
  onHandler: {
    before(fn: THooks<TContext>["onHandlerBefore"]): TRouter;
    after(fn: THooks<TContext>["onHandlerAfter"]): TRouter;
    error(fn: THooks<TContext>["onHandlerError"]): TRouter;
    finally(fn: THooks<TContext>["onHandlerFinally"]): TRouter;
  };
};

export type LogLevel = "none" | "minimal" | "standard" | "verbose";

export type TMiddleware<TContext extends TDefaultCtx> = (
  ctx: TContext
) => TContext | Promise<TContext>;

export type CtxRouterConfig = {
  logLevel?: LogLevel;
  /**
   * Enable or disable stats collection (CPU/memory metrics).
   * Defaults to true.
   *
   * Set to false to disable stats updates entirely.
   * Useful for:
   * - Performance tuning (avoid process.cpuUsage() calls)
   * - Compliance (disable telemetry in certain environments)
   * - Testing (deterministic behavior)
   */
  statsEnabled?: boolean;
};
