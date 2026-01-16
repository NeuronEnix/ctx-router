import {
  CtxRouter,
  TDefaultCtx,
  ctxErrMap,
  DEFAULT_USER_ROLE,
} from "../../../src";
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

// Example middleware
const logMiddleware = async (ctx: TCtx): Promise<TCtx> => {
  console.log(`[middleware] ${ctx.req.route.raw}`);
  return ctx;
};

const authMiddleware = async (ctx: TCtx): Promise<TCtx> => {
  console.log(`[auth] checking auth`);
  return ctx;
};

// Set your router
const cr = new CtxRouter<TCtx>();
// Health routes
cr.route("GET /health/ping").to(api.health.ping);
// Chained through + to
cr.route("GET /health/ping-log")
  .via(logMiddleware)
  .via(authMiddleware)
  .to(api.health.ping);

const userRateLimitMiddleware = async (ctx: TCtx): Promise<TCtx> => {
  console.log(`[rate limit] checking rate limit`);
  return ctx;
}
// User routes with inherited middleware
const userRouter = cr.route("user").via( userRateLimitMiddleware, logMiddleware);
userRouter.route("POST /update").to(api.user.update);

userRouter.route("GET /:userId").to(api.user.detail);
userRouter.route("detail").to(api.user.detail);

export { cr as router };
