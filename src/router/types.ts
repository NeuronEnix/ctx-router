import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";
import { CtxError } from "./error";

export type TRoute<TContext extends TDefaultCtx> = {
  pattern: string;
  matcher: MatchFunction<object>;
  handler: (ctx: TContext) => Promise<TContext>;
};

export type THooks = {
  // Exec lifecycle hooks (outer) - wraps routing + handler
  onExecBefore<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  onExecAfter<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  onExecError<TContext extends TDefaultCtx>(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  onExecFinally<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;

  // Handler lifecycle hooks (inner) - wraps user's business logic
  onHandlerBefore<TContext extends TDefaultCtx>(
    ctx: TContext
  ): Promise<TContext>;
  onHandlerAfter<TContext extends TDefaultCtx>(
    ctx: TContext
  ): Promise<TContext>;
  onHandlerError<TContext extends TDefaultCtx>(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  onHandlerFinally<TContext extends TDefaultCtx>(
    ctx: TContext
  ): Promise<TContext>;
};

export type LogLevel = "none" | "minimal" | "standard" | "verbose";

export type CtxRouterConfig = {
  logLevel?: LogLevel;
};
