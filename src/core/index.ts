import { CtxMeta } from "./meta";
import { CtxReq } from "./req";
import { CtxRes } from "./res";
import { CtxUser } from "./user";
import { CtxError } from "../error";

// Export types
export type { CtxMeta } from "./meta";
export type { CtxReq } from "./req";
export type { CtxRes } from "./res";
export type { CtxUser } from "./user";

export const DEFAULT_USER_ROLE = {
  none: "none",
  user: "user",
  admin: "admin",
  service: "service",
} as const;

export type TDefaultCtx = {
  id: string;
  req: CtxReq;
  res: CtxRes;
  err: CtxError | null;
  user: CtxUser;
  meta: CtxMeta;
};
