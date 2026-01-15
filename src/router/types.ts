import { MatchFunction } from "path-to-regexp";
import { TDefaultCtx } from "../core";
import { CtxError } from "./error";

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
