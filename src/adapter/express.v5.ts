import { Request, Response } from "express";
import { TDefaultCtx } from "../core";

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

/**
 * Enriches an existing context with Express request data.
 * Modifies ctx in-place.
 *
 * @param ctx - Context created by router.getNewCtx()
 * @param req - Express request object
 */
export function enrichFromExpress(
  ctx: TDefaultCtx,
  req: Request,
  res: Response
): void {
  const method = req.method;
  const path = getPath(req.url);

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

  // Build clientInvocation (only include fields that exist)
  const invocationTraceId = getHeader(req.headers, "x-ctx-trace-id");
  const invocationSeq = parseInt(
    getHeader(req.headers, "x-ctx-seq") || "0",
    10
  );
  const clientTsStr = getHeader(req.headers, "x-ctx-ts");
  const clientTs = clientTsStr ? new Date(clientTsStr).getTime() : undefined;

  const clientInvocation: TDefaultCtx["req"]["clientInvocation"] = {};
  if (invocationTraceId) clientInvocation.traceId = invocationTraceId;
  if (invocationSeq) clientInvocation.seq = invocationSeq;
  if (clientTs && !isNaN(clientTs)) clientInvocation.ts = clientTs;

  // Build transport meta (only include fields that exist)
  const userAgent = getHeader(req.headers, "user-agent");
  const contentType = getHeader(req.headers, "content-type");
  const transportMeta: Record<string, string> = {};
  if (userAgent) transportMeta["user-agent"] = userAgent;
  if (contentType) transportMeta["content-type"] = contentType;

  // Enrich ctx.req
  ctx.req.data = { ...req.body, ...req.query, ...req.params };
  ctx.req.route = {
    op: method, // HTTP method (GET, POST, etc.)
    raw: path, // Concrete path with "/" separator
    pattern: "PENDING", // Router will set after matching
  };

  if (Object.keys(auth).length > 0) ctx.req.auth = auth;
  if (Object.keys(client).length > 0) ctx.req.client = client;
  if (Object.keys(clientInvocation).length > 0)
    ctx.req.clientInvocation = clientInvocation;

  ctx.req.transport = {
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
    raw: {
      req,
      res,
    },
  };
}
