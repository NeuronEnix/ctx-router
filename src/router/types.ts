import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";
import { CtxError } from "./error";

export type TRoute<TContext extends TDefaultCtx> = {
  pattern: string;
  matcher: MatchFunction<object>;
  handler: (ctx: TContext) => Promise<TContext>;
};

export type THooks<TContext extends TDefaultCtx> = {
  // Exec lifecycle hooks (outer) - wraps routing + handler
  onExecBefore(ctx: TContext): Promise<TContext>;
  onExecAfter(ctx: TContext): Promise<TContext>;
  onExecError(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  onExecFinally(ctx: TContext): Promise<TContext>;

  // Handler lifecycle hooks (inner) - wraps user's business logic
  onHandlerBefore(ctx: TContext): Promise<TContext>;
  onHandlerAfter(ctx: TContext): Promise<TContext>;
  onHandlerError(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  onHandlerFinally(ctx: TContext): Promise<TContext>;
};

export type LogLevel = "none" | "minimal" | "standard" | "verbose";

export type CtxRouterConfig = {
  logLevel?: LogLevel;
};
