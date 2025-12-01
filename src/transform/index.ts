import crypto from "crypto";
import { TDefaultCtx } from "../ctx/ctx.types";
const instanceId = crypto.randomBytes(5).toString("hex");
const INSTANCE = {
  ID: instanceId,
  TRACE_ID: instanceId,
  CREATED_AT: new Date(),
  SERVICE_NAME: process.env.SERVICE_NAME || "my-service",
  SEQ: 0,
  INFLIGHT: 0,
  LAST_HEARTBEAT: new Date(),
  PORT: parseInt(process.env.SERVICE_PORT || "3000", 10),
};

type TCtxBuild = {
  method: string;
  path: string;
  header: Record<string, string | string[] | undefined>;
  data: Record<string, unknown>;
  ip: string;
  ips: string[];
};

export function buildCtx(ctxRaw: TCtxBuild) {
  const meta = buildMeta(ctxRaw);
  const req = buildReq(ctxRaw);
  const user = buildUser(ctxRaw);
  const res = buildRes();
  const id = meta.monitor.traceId;
  return { id, meta, req, user, res };
}

export async function doneCtx(ctx: TDefaultCtx): Promise<void> {
  ctx.meta.ts.out = new Date();
  ctx.meta.ts.execTime = ctx.meta.ts.out.getTime() - ctx.meta.ts.in.getTime();

  // Log context using ctxLogger
  // await logCtx(ctx);
  setResMeta(ctx);
  // decrease the number of request inflight when response of this request goes out
  INSTANCE.INFLIGHT--;
}

function buildMeta(ctxRaw: TCtxBuild): TDefaultCtx["meta"] {
  const inTime = new Date();
  ++INSTANCE.SEQ;
  ++INSTANCE.INFLIGHT;

  // Extract clientIn from header and validate if it's a valid date using IIFE
  const clientIn = (() => {
    const dtStr = ctxRaw.header["x-ctx-ts"];
    if (typeof dtStr !== "string") return inTime;
    const dt = new Date(dtStr);
    if (isNaN(dt.getTime())) return inTime;
    return dt;
  })();

  return {
    serviceName: INSTANCE.SERVICE_NAME,
    instance: {
      id: INSTANCE.ID,
      createdAt: INSTANCE.CREATED_AT,
      seq: INSTANCE.SEQ,
      inflight: INSTANCE.INFLIGHT,
      cpu: 0,
      mem: 0,
    },
    ts: {
      in: inTime,
      clientIn: clientIn,
      owd: inTime.getTime() - clientIn.getTime(),
    },
    monitor: {
      traceId: `${INSTANCE.ID}-${INSTANCE.SEQ}`,
      spanId: `${INSTANCE.ID}-${INSTANCE.SEQ}`,
    },
    log: {
      stdout: [],
      db: [],
    },
  };
}

function buildReq(data: TCtxBuild): TDefaultCtx["req"] {
  return {
    method: data.method,
    path: data.path,
    header: data.header,
    data: data.data,
    ip: data.ip,
    ips: data.ips,
  };
}

function buildUser(ctxRaw: TCtxBuild): TDefaultCtx["user"] {
  const header = ctxRaw.header;
  return {
    id: "none",
    role: [],
    scope: [],
    name: null,
    auth: {
      token: String(
        header["authorization"] || header["Authorization"] || "none"
      ),
      refresh: String(header["x-ctx-refresh-token"] || "none"),
    },
  };
}

function buildRes(): TDefaultCtx["res"] {
  return {
    code: "OK",
    msg: "OK",
    data: {},
  };
}

function setResMeta(ctx: TDefaultCtx): void {
  const meta = ctx.meta;
  const clientSeq = parseInt(ctx.req.header["x-ctx-seq"] || "0");
  ctx.res.meta = {
    ctxId: ctx.id,
    seq: Number.isInteger(clientSeq) ? clientSeq : 0,
    traceId: meta.monitor.traceId,
    spanId: meta.monitor.spanId,
    inTime: meta.ts.in,
    outTime: meta.ts.out!,
    execTime: meta.ts.execTime!,
    owd: meta.ts.owd,
  };
}
