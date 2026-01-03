import { Request } from "express";
import { TDefaultCtx, CtxUser } from "../core";
import { INSTANCE, getNextSeq, incrementInflight } from ".";

function getPath(url: string): string {
  const queryParamPos = url.indexOf("?");
  if (queryParamPos === -1) return url;
  return url.substring(0, queryParamPos);
}

function extractBearerToken(
  authHeader: string | string[] | undefined
): string | undefined {
  if (!authHeader) return undefined;
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (auth?.startsWith("Bearer ")) {
    return auth.substring(7);
  }
  return undefined;
}

function getHeader(
  headers: Request["headers"],
  key: string
): string | undefined {
  const value = headers[key];
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function transformFromExpress(req: Request): TDefaultCtx {
  const inTime = Date.now();
  const seq = getNextSeq();
  incrementInflight();

  const method = req.method;
  const path = getPath(req.url);
  const route = `${method} ${path}`;

  // Extract clientIn from header and validate
  const clientInStr = getHeader(req.headers, "x-ctx-ts");
  const clientIn = clientInStr ? new Date(clientInStr).getTime() : inTime;
  const validClientIn = isNaN(clientIn) ? inTime : clientIn;

  // Build auth (only include fields that exist)
  const bearerToken = extractBearerToken(req.headers.authorization);
  const apiKey = getHeader(req.headers, "x-api-key");
  const refreshToken = getHeader(req.headers, "x-ctx-refresh-token");
  const auth: TDefaultCtx["req"]["auth"] = {};
  if (bearerToken) auth.bearerToken = bearerToken;
  if (apiKey) auth.apiKey = apiKey;
  if (refreshToken) auth.refreshToken = refreshToken;

  // Build client (only include fields that exist)
  const deviceName = getHeader(req.headers, "x-ctx-device-name");
  const deviceId = getHeader(req.headers, "x-ctx-device-id");
  const os = getHeader(req.headers, "x-ctx-os");
  const appVersion = getHeader(req.headers, "x-ctx-app-version");
  const apiVersion = getHeader(req.headers, "x-ctx-api-version");
  const sessionId = getHeader(req.headers, "x-ctx-session-id");
  const client: TDefaultCtx["req"]["client"] = {};
  if (deviceName) client.deviceName = deviceName;
  if (deviceId) client.deviceId = deviceId;
  if (os) client.os = os;
  if (appVersion) client.appVersion = appVersion;
  if (apiVersion) client.apiVersion = apiVersion;
  if (sessionId) client.sessionId = sessionId;

  // Build invocation (only include fields that exist)
  const invocationTraceId = getHeader(req.headers, "x-ctx-trace-id");
  const invocationSeq = parseInt(
    getHeader(req.headers, "x-ctx-seq") || "0",
    10
  );
  const invocation: TDefaultCtx["req"]["invocation"] = {};
  if (invocationTraceId) invocation.traceId = invocationTraceId;
  if (invocationSeq) invocation.seq = invocationSeq;
  if (validClientIn) invocation.ts = validClientIn;

  // Build transport meta (only include fields that exist)
  const userAgent = getHeader(req.headers, "user-agent");
  const contentType = getHeader(req.headers, "content-type");
  const transportMeta: Record<string, string> = {};
  if (userAgent) transportMeta["user-agent"] = userAgent;
  if (contentType) transportMeta["content-type"] = contentType;

  // Build CtxReq
  const ctxReq: TDefaultCtx["req"] = {
    data: { ...req.body, ...req.query, ...req.params },
    route,
    routePattern: route, // Router will reassign after matching

    ...(Object.keys(auth).length > 0 && { auth }),
    ...(Object.keys(client).length > 0 && { client }),
    ...(Object.keys(invocation).length > 0 && { invocation }),

    transport: {
      protocol: "http",
      request: {
        method,
        path,
      },
      ...(req.ip && {
        network: {
          originIp: req.ip,
          hops: req.ips,
        },
      }),
      ...(Object.keys(transportMeta).length > 0 && { meta: transportMeta }),
      raw: req,
    },
  };

  // Build default user (anonymous)
  const user: CtxUser = {
    kind: "user",
    id: "none",
    role: ["none"],
    scope: [],
    handle: null,
  };

  // Build CtxMeta
  const traceId = `${INSTANCE.ID}-${seq}`;
  const spanId = `${INSTANCE.ID}-${seq}`;

  const meta: TDefaultCtx["meta"] = {
    serviceName: INSTANCE.SERVICE_NAME,
    instance: {
      id: INSTANCE.ID,
      createdAt: INSTANCE.CREATED_AT,
      seq,
      inflight: INSTANCE.INFLIGHT,
      cpu: 0,
      mem: 0,
    },
    ts: {
      in: inTime,
      clientIn: validClientIn,
      out: 0,
      execTime: 0,
      owd: inTime - validClientIn,
    },
    monitor: {
      traceId,
      spanId,
    },
    log: {
      stdout: [],
      db: [],
    },
  };

  // Build CtxRes
  const res: TDefaultCtx["res"] = {
    code: "OK",
    msg: "OK",
    data: {},
  };

  // Build TDefaultCtx
  return {
    id: traceId,
    req: ctxReq,
    res,
    err: null,
    user,
    meta,
  };
}
