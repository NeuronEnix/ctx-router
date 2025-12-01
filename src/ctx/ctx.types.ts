export const USER_ROLE = {
  USER: "USER",
  ADMIN: "ADMIN",
  SERVER: "SERVER",
  NONE: "NONE",
} as const;

type CtxReq = {
  header: {
    authorization?: string;
    "x-ctx-device-name"?: string;
    "x-ctx-device-id"?: string;
    "x-ctx-os"?: string;
    "x-ctx-app-version"?: string;
    "x-ctx-api-version"?: string;
    "x-ctx-session-id"?: string;
    "x-ctx-seq"?: string;
    "x-ctx-ts"?: string;
    "x-ctx-refresh-token"?: string;
    "x-ctx-csrf"?: string;
    "x-ctx-trace-id"?: string;
    [key: string]: string | string[] | undefined;
  };
  method: string;
  path: string;
  data: { userId?: string; [key: string]: unknown };
  ip: string;
  ips: string[];
};

type CtxRes = {
  code: string;
  msg: string;
  data: { [key: string]: unknown };
  info?: unknown;
  meta?: {
    ctxId: string;
    seq: number;
    traceId: string;
    spanId: string;
    inTime: Date;
    outTime: Date;
    execTime: number;
    owd: number;
  };
};

type CtxMeta = {
  serviceName: string;
  instance: {
    id: string;
    createdAt: Date;
    seq: number;
    inflight: number; // number of request inflight when this request came in
    cpu: number;
    mem: number; // mb
  };
  ts: {
    in: Date;
    clientIn: Date;
    owd: number;
    out?: Date;
    execTime?: number;
  };
  monitor: {
    traceId: string;
    spanId: string;
  };
  log: {
    stdout: string[];
    db: { q: string; p: unknown[]; ms: number }[];
  };
};

type CtxUser = {
  id: string;
  role: Array<keyof typeof USER_ROLE>;
  scope: string[];
  name: string | null;
  auth: { token: string; refresh: string };
};

export type TDefaultCtx = {
  id: string;
  req: CtxReq;
  res: CtxRes;
  user: CtxUser;
  meta: CtxMeta;
};
