import { CtxRouter, TDefaultCtx, ctxErrMap, DEFAULT_USER_ROLE } from "ctx-router";
import * as api from "./api/index";

export type TCtx = TDefaultCtx & {
  user: { role: (keyof typeof DEFAULT_USER_ROLE)[] };
};
export { DEFAULT_USER_ROLE };
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
const router = new CtxRouter<TCtx>();

router.handle({
  protocol: "http",
  action: "GET",
  pattern: "/health/ping",
  handler: api.health.ping,
});

router.handle({
  protocol: "http",
  action: "POST",
  pattern: "/user/update",
  handler: api.user.update,
});

router.handle({
  protocol: "http",
  action: "GET",
  pattern: "/user/:userId",
  handler: api.user.detail,
});

export { router };
