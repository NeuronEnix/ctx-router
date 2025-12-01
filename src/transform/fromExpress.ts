import { Request } from "express";
import { TDefaultCtx } from "../ctx/ctx.types";
import { buildCtx } from ".";

function getPath(url: string): string {
  const queryParamPos = url.indexOf("?");
  if (queryParamPos === -1) return url;
  return url.substring(0, queryParamPos);
}

export function transformFromExpress(req: Request): TDefaultCtx {
  const ctx = buildCtx({
    method: req.method,
    path: getPath(req.url),
    header: req.headers,
    data: req.method === "POST" ? req.body || {} : req.query || {},
    ip: req.ip || "",
    ips: req.ips || [],
  });
  return ctx;
}
