import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";

export type TRoute<TUserCtx extends TDefaultCtx> = {
  op?: string; // Optional: HTTP method, event name, etc.
  pattern: string; // Pattern with :params (identity)
  matcher: MatchFunction<object>; // Compiled regex from path-to-regexp
  handler: (ctx: TUserCtx) => Promise<TUserCtx>;
};

export type TRouteEntry<TUserCtx extends TDefaultCtx> = {
  route: TRoute<TUserCtx>;
  segments: string[]; // Track original segments for logging
};

// Side-effect hooks - mutate ctx directly, no return needed
export type TOnExecBefore<TUserCtx extends TDefaultCtx> = (
  ctx: TUserCtx
) => void | Promise<void>;

export type TOnExecAfter<TUserCtx extends TDefaultCtx> = (
  ctx: TUserCtx
) => void | Promise<void>;

export type TOnExecError<TUserCtx extends TDefaultCtx> = (
  ctx: TUserCtx,
  error: Error | unknown
) => void | Promise<void>;

export type TOnExecFinally<TUserCtx extends TDefaultCtx> = (
  ctx: TUserCtx
) => void | Promise<void>;

export type THooks<TUserCtx extends TDefaultCtx> = {
  // Exec lifecycle hooks (outer) - wraps routing + handler
  onExecBefore?: TOnExecBefore<TUserCtx>;
  onExecAfter?: TOnExecAfter<TUserCtx>;
  /**
   * If present, the router will call this hook and RETURN `ctx` from exec().
   * If absent, the router will RE-THROW the caught error.
   */
  onExecError?: TOnExecError<TUserCtx>;
  onExecFinally?: TOnExecFinally<TUserCtx>;
};

// Hook DSL type for fluent API (forward reference resolved by CtxRouter import)
export type THookDSL<TUserCtx extends TDefaultCtx, TRouter> = {
  onExec: {
    before(fn: TOnExecBefore<TUserCtx>): TRouter;
    after(fn: TOnExecAfter<TUserCtx>): TRouter;
    error(fn: TOnExecError<TUserCtx>): TRouter;
    finally(fn: TOnExecFinally<TUserCtx>): TRouter;
  };
};

export type LogLevel = "none" | "minimal" | "standard" | "verbose";

export type TMiddleware<TUserCtx extends TDefaultCtx> = (
  ctx: TUserCtx
) => TUserCtx | Promise<TUserCtx>;

export type CtxRouterConfig = {
  /**
   * Service name injected into `ctx.meta.serviceName`.
   */
  serviceName?: string;
  logLevel?: LogLevel;
};
