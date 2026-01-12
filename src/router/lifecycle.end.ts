import { TRouterInstance, decrementInflight } from "./instance";
import { TDefaultCtx } from "../core";

/**
 * Ends the request lifecycle by finalizing the context.
 * Decrements INFLIGHT counter and sets response metadata.
 *
 * This is the final step in the three-phase request lifecycle:
 * 1. begin() - Create context, increment metrics
 * 2. exec() - Execute route handler
 * 3. end() - Finalize context, decrement metrics
 *
 * Sets timing information and response metadata before decrementing INFLIGHT.
 *
 * @param ctx - The context to finalize
 * @param instance - Router instance data
 */
export function end<TContext extends TDefaultCtx>(
  ctx: TContext,
  instance: TRouterInstance
): void {
  // Set final timestamps
  ctx.meta.ts.out = Date.now();
  ctx.meta.ts.execTime = ctx.meta.ts.out - ctx.meta.ts.in;

  // Set response meta
  const meta = ctx.meta;
  const clientSeq = ctx.req.invocation?.seq || 0;
  ctx.res.meta = {
    ctxId: ctx.id,
    seq: Number.isInteger(clientSeq) ? clientSeq : 0,
    traceId: meta.monitor.traceId,
    spanId: meta.monitor.spanId,
    inTime: meta.ts.in,
    outTime: meta.ts.out,
    execTime: meta.ts.execTime,
    owd: meta.ts.owd,
  };

  // Decrement inflight
  decrementInflight(instance);
}
