import crypto from "crypto";
import { TDefaultCtx } from "../core";

const instanceId = crypto.randomBytes(5).toString("hex");

export const INSTANCE = {
  ID: instanceId,
  TRACE_ID: instanceId,
  CREATED_AT: Date.now(),
  SERVICE_NAME: process.env["SERVICE_NAME"] || "my-service",
  SEQ: 0,
  INFLIGHT: 0,
  LAST_HEARTBEAT: Date.now(),
  PORT: parseInt(process.env["SERVICE_PORT"] || "3000", 10),
};

export function getNextSeq(): number {
  return ++INSTANCE.SEQ;
}

export function incrementInflight(): number {
  return ++INSTANCE.INFLIGHT;
}

export function decrementInflight(): number {
  return --INSTANCE.INFLIGHT;
}

export async function doneCtx(ctx: TDefaultCtx): Promise<void> {
  ctx.meta.ts.out = Date.now();
  ctx.meta.ts.execTime = ctx.meta.ts.out - ctx.meta.ts.in;

  // Log context using ctxLogger
  // await logCtx(ctx);
  setResMeta(ctx);

  // Decrease the number of request inflight when response of this request goes out
  decrementInflight();
}

function setResMeta(ctx: TDefaultCtx): void {
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
}
