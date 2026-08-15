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

  // RFC 9110: the auth-scheme token is case-insensitive. The credentials that
  // follow are NOT - they are passed through byte-for-byte (only surrounding
  // whitespace is trimmed).
  const sep = raw.indexOf(" ");
  if (sep === -1) return null;
  const scheme = raw.slice(0, sep).toLowerCase();
  const credentials = raw.slice(sep + 1).trim();

  if (scheme === "bearer") {
    return credentials ? { kind: "bearer", token: credentials } : null;
  }

  if (scheme === "basic") {
    if (!credentials) return null;
    const decoded = Buffer.from(credentials, "base64").toString("utf8");
    const colon = decoded.indexOf(":");
    if (colon === -1) return null;
    const clientId = decoded.slice(0, colon);
    const clientSecret = decoded.slice(colon + 1);
    if (!clientId) return null;
    return { kind: "basic", clientId, clientSecret };
  }

  return null;
}

const API_KEY_HEADERS = ["x-ctx-api-key", "x-api-key", "apikey"] as const;

// Non-negative decimal integer, surrounding whitespace tolerated.
const DECIMAL_INTEGER_RE = /^\d+$/;

/**
 * Parses a numeric caller hint (epoch ms or a plain counter).
 *
 * `Number()` is far too permissive for header input - it happily turns
 * "0x10" into 16, "1e3" into 1000 and " " into 0. Only a plain non-negative
 * decimal integer is accepted; everything else is dropped so a malformed
 * hint can never masquerade as a real timestamp.
 *
 * @param raw - Header value, if present
 * @returns The parsed number, or undefined when the hint is absent/invalid
 */
function parseCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!DECIMAL_INTEGER_RE.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Enriches an existing context with Express request data.
 * Modifies ctx in-place.
 *
 * @param ctx - Context created by router.newCtx()
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
  // Numeric hints are epoch ms / plain counters: only non-negative decimal
  // integers are accepted (see parseCount). Hex, exponent, float, signed and
  // otherwise malformed values are dropped, never coerced or truncated.
  const seq = parseCount(getHeader(req.headers, "x-ctx-seq"));
  const ts = parseCount(getHeader(req.headers, "x-ctx-client-ts"));
  const ingressIn = parseCount(getHeader(req.headers, "x-ctx-ingress-in"));

  if (appVersion) caller.appVersion = appVersion;
  if (apiVersion) caller.apiVersion = apiVersion;
  if (sessionId) caller.sessionId = sessionId;
  if (deviceId) caller.deviceId = deviceId;
  if (traceId) caller.traceId = traceId;
  if (spanId) caller.spanId = spanId;
  if (traceparent) caller.traceparent = traceparent;
  // parseCount already rejected everything that isn't a safe integer
  if (seq !== undefined) caller.seq = seq;
  if (ts !== undefined) caller.ts = ts;
  if (ingressIn !== undefined) caller.ingressIn = ingressIn;

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
