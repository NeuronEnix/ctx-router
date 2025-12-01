import { TDefaultCtx } from "../ctx/ctx.types";

export async function handleBeforeExec<TContext extends TDefaultCtx>(
  ctx: TContext
): Promise<TContext> {
  const reqPath = `${ctx.req.method} ${ctx.req.path}`;
  const header = ctx.req.header;
  console.log(
    `CtxReq: [${reqPath}] | [IP: ${ctx.req.ips || ctx.req.ip}] | [TraceId: ${ctx.meta.monitor.traceId}] | [SpanId: ${ctx.meta.monitor.spanId}]`
  );
  console.log(
    `CtxUser: [Session: ${header["x-ctx-session-id"]}] | [Seq: ${header["x-ctx-seq"]}]`
  );
  console.log(
    `CtxMeta: [Seq: ${ctx.meta.instance.seq}] | [Inflight: ${ctx.meta.instance.inflight}]`
  );
  return ctx;
}
