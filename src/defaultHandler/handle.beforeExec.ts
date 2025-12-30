import { TDefaultCtx } from "../ctx/ctx.types";
import { LogLevel } from "../ctx/ctx.router";

export function createBeforeExecHandler<TContext extends TDefaultCtx>(
  logLevel: LogLevel
) {
  return async (ctx: TContext): Promise<TContext> => {
    if (logLevel === "none") return ctx;

    const traceId = ctx.meta.monitor.traceId;
    const method = ctx.req.method;
    const path = ctx.req.path;

    if (logLevel === "minimal") {
      console.log(`[${method} ${path}] TraceId: ${traceId}`);
      return ctx;
    }

    const userId = ctx.user.id;
    const instanceSeq = ctx.meta.instance.seq;
    const inflight = ctx.meta.instance.inflight;

    if (logLevel === "standard") {
      console.log(
        `[${method} ${path}] TraceId: ${traceId} | UserId: ${userId} | Seq: ${instanceSeq} | Inflight: ${inflight}`
      );
      return ctx;
    }

    // verbose
    const ip = ctx.req.ips || ctx.req.ip;
    const userSeq = ctx.req.header["x-ctx-seq"] || "0";
    const spanId = ctx.meta.monitor.spanId;
    const reqData = JSON.stringify(ctx.req.data);

    console.log(
      `[${method} ${path}] IP: ${ip} | TraceId: ${traceId} | SpanId: ${spanId} | UserId: ${userId} | UserSeq: ${userSeq} | Seq: ${instanceSeq} | Inflight: ${inflight} | Data: ${reqData}`
    );
    return ctx;
  };
}
