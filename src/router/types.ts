import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";

export type TRoute<TUserContext extends TDefaultCtx> = {
  op?: string; // Optional: HTTP method, event name, etc.
  pattern: string; // Pattern with :params (identity)
  matcher: MatchFunction<object>; // Compiled regex from path-to-regexp
  handler: (ctx: TUserContext) => Promise<TUserContext>;
};

export type TRouteEntry<TUserContext extends TDefaultCtx> = {
  route: TRoute<TUserContext>;
  segments: string[]; // Track original segments for logging
};

// Side-effect hooks - mutate ctx directly, no return needed
export type TOnExecBefore<TUserContext extends TDefaultCtx> = (
  ctx: TUserContext
) => void | Promise<void>;

export type TOnExecAfter<TUserContext extends TDefaultCtx> = (
  ctx: TUserContext
) => void | Promise<void>;

export type TOnExecError<TUserContext extends TDefaultCtx> = (
  ctx: TUserContext,
  error: Error | unknown
) => void | Promise<void>;

export type TOnExecFinally<TUserContext extends TDefaultCtx> = (
  ctx: TUserContext
) => void | Promise<void>;

export type THooks<TUserContext extends TDefaultCtx> = {
  // Exec lifecycle hooks (outer) - wraps routing + handler
  onExecBefore?: TOnExecBefore<TUserContext>;
  onExecAfter?: TOnExecAfter<TUserContext>;
  /**
   * If present, the router will call this hook and RETURN `ctx` from exec().
   * If absent, the router will RE-THROW the caught error.
   */
  onExecError?: TOnExecError<TUserContext>;
  onExecFinally?: TOnExecFinally<TUserContext>;
};

// Hook DSL type for fluent API (forward reference resolved by CtxRouter import)
export type THookDSL<TUserContext extends TDefaultCtx, TRouter> = {
  onExec: {
    before(fn: TOnExecBefore<TUserContext>): TRouter;
    after(fn: TOnExecAfter<TUserContext>): TRouter;
    error(fn: TOnExecError<TUserContext>): TRouter;
    finally(fn: TOnExecFinally<TUserContext>): TRouter;
  };
};

export type LogLevel = "none" | "minimal" | "standard" | "verbose";

export type TMiddleware<TUserContext extends TDefaultCtx> = (
  ctx: TUserContext
) => TUserContext | Promise<TUserContext>;

export type CtxRouterConfig = {
  /**
   * Service name injected into `ctx.meta.serviceName`.
   */
  serviceName?: string;
  logLevel?: LogLevel;
};
