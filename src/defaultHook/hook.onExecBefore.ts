import { TDefaultCtx } from "../core";
import { LogLevel } from "../router/types";

export function defaultHookOnExecBefore<TContext extends TDefaultCtx>(
  logLevel: LogLevel
) {
  return async (ctx: TContext): Promise<void> => {
    if (logLevel === "none") return;

    const traceId = ctx.meta.monitor.traceId;
    const pattern = ctx.req.route.pattern;

    if (logLevel === "minimal") {
      console.log(`[${pattern}] TraceId: ${traceId}`);
      return;
    }

    const userId = ctx.user.id;
    const instanceSeq = ctx.meta.instance.seq;
    const inflight = ctx.meta.instance.inflight;
    const routeRaw = ctx.req.route.raw;

    if (logLevel === "standard") {
      console.log(
        `[${pattern} -> ${routeRaw}] TraceId: ${traceId} | UserId: ${userId} | Seq: ${instanceSeq} | Inflight: ${inflight}`
      );
      return;
    }

    // verbose
    const ip = ctx.req.transport?.network?.originIp || "unknown";
    const userSeq = ctx.req.clientInvocation?.seq || 0;
    const spanId = ctx.meta.monitor.spanId;
    const reqData = JSON.stringify(ctx.req.data);

    console.log(
      `[${pattern} -> ${routeRaw}] IP: ${ip} | TraceId: ${traceId} | SpanId: ${spanId} | UserId: ${userId} | UserSeq: ${userSeq} | Seq: ${instanceSeq} | Inflight: ${inflight} | Data: ${reqData}`
    );
  };
}
