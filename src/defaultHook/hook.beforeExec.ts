import { TDefaultCtx } from "../core";
import { LogLevel } from "../router";

export function defaultHookBeforeExec<TContext extends TDefaultCtx>(
  logLevel: LogLevel
) {
  return async (ctx: TContext): Promise<TContext> => {
    if (logLevel === "none") return ctx;

    const traceId = ctx.meta.monitor.traceId;
    const pattern = ctx.req.routePattern;

    if (logLevel === "minimal") {
      console.log(`[${pattern}] TraceId: ${traceId}`);
      return ctx;
    }

    const userId = ctx.user.id;
    const instanceSeq = ctx.meta.instance.seq;
    const inflight = ctx.meta.instance.inflight;
    const route = ctx.req.route;

    if (logLevel === "standard") {
      console.log(
        `[${pattern} -> ${route}] TraceId: ${traceId} | UserId: ${userId} | Seq: ${instanceSeq} | Inflight: ${inflight}`
      );
      return ctx;
    }

    // verbose
    const ip = ctx.req.transport?.network?.originIp || "unknown";
    const userSeq = ctx.req.invocation?.seq || 0;
    const spanId = ctx.meta.monitor.spanId;
    const reqData = JSON.stringify(ctx.req.data);

    console.log(
      `[${pattern} -> ${route}] IP: ${ip} | TraceId: ${traceId} | SpanId: ${spanId} | UserId: ${userId} | UserSeq: ${userSeq} | Seq: ${instanceSeq} | Inflight: ${inflight} | Data: ${reqData}`
    );
    return ctx;
  };
}
