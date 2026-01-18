import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";

export type TRoute<TContext extends TDefaultCtx> = {
  op?: string; // Optional: HTTP method, event name, etc.
  pattern: string; // Pattern with :params (identity)
  matcher: MatchFunction<object>; // Compiled regex from path-to-regexp
  handler: (ctx: TContext) => Promise<TContext>;
};

export type TRouteEntry<TContext extends TDefaultCtx> = {
  route: TRoute<TContext>;
  segments: string[]; // Track original segments for logging
};

// Side-effect hooks - mutate ctx directly, no return needed
export type TOnExecBefore<TContext extends TDefaultCtx> = (
  ctx: TContext
) => void | Promise<void>;

export type TOnExecAfter<TContext extends TDefaultCtx> = (
  ctx: TContext
) => void | Promise<void>;

export type TOnExecError<TContext extends TDefaultCtx> = (
  ctx: TContext,
  error: Error | unknown
) => void | Promise<void>;

export type TOnExecFinally<TContext extends TDefaultCtx> = (
  ctx: TContext
) => void | Promise<void>;

export type THooks<TContext extends TDefaultCtx> = {
  // Exec lifecycle hooks (outer) - wraps routing + handler
  onExecBefore?: TOnExecBefore<TContext>;
  onExecAfter?: TOnExecAfter<TContext>;
  /**
   * If present, the router will call this hook and RETURN `ctx` from exec().
   * If absent, the router will RE-THROW the caught error.
   */
  onExecError?: TOnExecError<TContext>;
  onExecFinally?: TOnExecFinally<TContext>;
};

// Hook DSL type for fluent API (forward reference resolved by CtxRouter import)
export type THookDSL<TContext extends TDefaultCtx, TRouter> = {
  onExec: {
    before(fn: TOnExecBefore<TContext>): TRouter;
    after(fn: TOnExecAfter<TContext>): TRouter;
    error(fn: TOnExecError<TContext>): TRouter;
    finally(fn: TOnExecFinally<TContext>): TRouter;
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
