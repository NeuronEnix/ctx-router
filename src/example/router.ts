import { CtxRouter, TDefaultCtx, ctxErrMap } from "..";
import * as api from "./api/index";
import { ctxRedisClient } from "./config/ctx.redis.config";
export const USER_ROLE = {
  USER: "USER",
  ADMIN: "ADMIN",
  SERVER: "SERVER",
  NONE: "NONE",
} as const;
export type TCtx = TDefaultCtx & { user: { role: (keyof typeof USER_ROLE)[] } };
export const ctxErr = ctxErrMap({
  general: {
    UNKNOWN_ERROR: "Something went wrong",
    RESPONSE_NOT_SET: "Response not set",
    MALFORMED_REQUEST_DATA: "Malformed request data",
    HANDLER_NOT_FOUND: "Handler not found",
    NOT_FOUND: "Not found",
  },
  auth: {
    UNAUTHORIZED: "Unauthorized",
    TOKEN_EXPIRED: "Token expired",
    INVALID_TOKEN: "Invalid token",
  },
});
// Set your router
const router = new CtxRouter<TCtx>({
  log: { capture: true },
  stream: { redisClient: ctxRedisClient, key: "CTX:OBJ" },
});

router.handle("GET", "/health/ping", api.health.ping);
router.handle("POST", "/user/update", api.user.update);
router.handle("GET", "/user/detail", api.user.detail);

export { router };
