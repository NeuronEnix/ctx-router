import { Request, Response } from "express";
import { TDefaultCtx } from "../core";

function getPath(url: string): string {
  const queryParamPos = url.indexOf("?");
  if (queryParamPos === -1) return url;
  return url.substring(0, queryParamPos);
}

function getHeader(
  headers: Request["headers"],
  key: string
): string | undefined {
  const value = headers[key];
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function getFirstHeader(
  headers: Request["headers"],
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const v = getHeader(headers, key);
    if (v) return v;
  }
  return undefined;
}

type ParsedAuthorization =
  | { kind: "bearer"; token: string }
  | { kind: "basic"; clientId: string; clientSecret: string }
  | null;

function parseAuthorization(raw: string | undefined): ParsedAuthorization {
  if (!raw) return null;

  if (raw.startsWith("Bearer ")) {
    const token = raw.slice(7).trim();
    return token ? { kind: "bearer", token } : null;
  }

  if (raw.startsWith("Basic ")) {
    const encoded = raw.slice(6).trim();
    if (!encoded) return null;
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return null;
    const clientId = decoded.slice(0, sep);
    const clientSecret = decoded.slice(sep + 1);
    if (!clientId) return null;
    return { kind: "basic", clientId, clientSecret };
  }

  return null;
}

const API_KEY_HEADERS = ["x-ctx-api-key", "x-api-key", "apikey"] as const;

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

  const auth: TDefaultCtx["req"]["auth"] = {};
  const parsedAuth = parseAuthorization(
    getHeader(req.headers, "authorization")
  );
  if (parsedAuth?.kind === "bearer") {
    auth.bearerToken = parsedAuth.token;
  } else if (parsedAuth?.kind === "basic") {
    auth.clientId = parsedAuth.clientId;
    auth.clientSecret = parsedAuth.clientSecret;
  }
  const apiKey = getFirstHeader(req.headers, API_KEY_HEADERS);
  if (apiKey) auth.apiKey = apiKey;
  const refreshToken = getHeader(req.headers, "x-ctx-refresh-token");
  if (refreshToken) auth.refreshToken = refreshToken;

  const caller: TDefaultCtx["req"]["caller"] = {};
  const appVersion = getHeader(req.headers, "x-ctx-app-version");
  const apiVersion = getHeader(req.headers, "x-ctx-api-version");
  const sessionId = getHeader(req.headers, "x-ctx-session-id");
  const deviceId = getHeader(req.headers, "x-ctx-device-id");
  const traceId = getHeader(req.headers, "x-ctx-trace-id");
  const spanId = getHeader(req.headers, "x-ctx-span-id");
  const traceparent = getHeader(req.headers, "traceparent");
  // Numeric hints are epoch ms / integers; strict Number() parsing so
  // malformed values are dropped instead of silently truncated
  const seqStr = getHeader(req.headers, "x-ctx-seq");
  const seq = seqStr ? Number(seqStr) : undefined;
  const tsStr = getHeader(req.headers, "x-ctx-client-ts");
  const ts = tsStr ? Number(tsStr) : undefined;
  const ingressInStr = getHeader(req.headers, "x-ctx-ingress-in");
  const ingressIn = ingressInStr ? Number(ingressInStr) : undefined;

  if (appVersion) caller.appVersion = appVersion;
  if (apiVersion) caller.apiVersion = apiVersion;
  if (sessionId) caller.sessionId = sessionId;
  if (deviceId) caller.deviceId = deviceId;
  if (traceId) caller.traceId = traceId;
  if (spanId) caller.spanId = spanId;
  if (traceparent) caller.traceparent = traceparent;
  if (seq !== undefined && Number.isFinite(seq)) caller.seq = seq;
  if (ts !== undefined && Number.isFinite(ts)) caller.ts = ts;
  if (ingressIn !== undefined && Number.isFinite(ingressIn))
    caller.ingressIn = ingressIn;

  // Raw headers escape hatch — copied so consumers don't need to reach into transport.raw.
  let hasHeaders = false;
  const headers: Record<string, string | string[]> = {};
  for (const k of Object.keys(req.headers)) {
    const v = req.headers[k];
    if (v !== undefined) {
      headers[k] = v;
      hasHeaders = true;
    }
  }

  // Enrich ctx.req
  ctx.req.data = { ...req.params, ...req.query, ...req.body };
  ctx.req.route = {
    op: method, // HTTP method (GET, POST, etc.)
    raw: path, // Concrete path with "/" separator
    pattern: "PENDING", // Router will set after matching
  };

  if (Object.keys(auth).length > 0) ctx.req.auth = auth;
  if (Object.keys(caller).length > 0) ctx.req.caller = caller;

  ctx.req.transport = {
    protocol: "http",
    framework: "express",
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
    ...(hasHeaders && { data: { headers } }),
    raw: {
      req,
      res,
    },
  };
}
