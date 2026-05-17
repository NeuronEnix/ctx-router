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

function parseAuthorization(
  authHeader: string | string[] | undefined
): ParsedAuthorization {
  if (!authHeader) return null;
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!raw) return null;

  if (raw.startsWith("Bearer ")) {
    const token = raw.slice(7).trim();
    return token ? { kind: "bearer", token } : null;
  }

  if (raw.startsWith("Basic ")) {
    const encoded = raw.slice(6).trim();
    if (!encoded) return null;
    let decoded: string;
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      return null;
    }
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

  // Build auth (only include fields that exist)
  const auth: TDefaultCtx["req"]["auth"] = {};
  const parsedAuth = parseAuthorization(req.headers.authorization);
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

  // Build caller (only include fields that exist)
  const caller: TDefaultCtx["req"]["caller"] = {};

  // identity / metadata
  const appVersion = getHeader(req.headers, "x-ctx-app-version");
  const apiVersion = getHeader(req.headers, "x-ctx-api-version");
  const sessionId = getHeader(req.headers, "x-ctx-session-id");
  const deviceId = getHeader(req.headers, "x-ctx-device-id");
  if (appVersion) caller.appVersion = appVersion;
  if (apiVersion) caller.apiVersion = apiVersion;
  if (sessionId) caller.sessionId = sessionId;
  if (deviceId) caller.deviceId = deviceId;

  // per-call correlation
  const invocationTraceId = getHeader(req.headers, "x-ctx-trace-id");
  const invocationSeq = parseInt(
    getHeader(req.headers, "x-ctx-seq") || "0",
    10
  );
  const clientTsStr = getHeader(req.headers, "x-ctx-client-ts");
  const clientTs = clientTsStr ? new Date(clientTsStr).getTime() : undefined;
  const ingressInStr = getHeader(req.headers, "x-ctx-ingress-in");
  const ingressIn = ingressInStr ? parseInt(ingressInStr, 10) : undefined;

  if (invocationTraceId) caller.traceId = invocationTraceId;
  if (invocationSeq) caller.seq = invocationSeq;
  if (clientTs && !isNaN(clientTs)) caller.ts = clientTs;
  if (ingressIn !== undefined && !isNaN(ingressIn))
    caller.ingressIn = ingressIn;

  // Stash raw headers as a transport-level hint (escape hatch).
  const headers: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers[k] = v;
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
    ...(Object.keys(headers).length > 0 && { data: { headers } }),
    raw: {
      req,
      res,
    },
  };
}
