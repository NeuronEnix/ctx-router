import { TDefaultCtx, DEFAULT_USER_ROLE } from "./core";
import { enrichFromExpress as enrichFromExpressImpl } from "./adapter/express.v5";
import { CtxRouter, LogLevel, TMiddleware } from "./router";
import { CtxError, ctxErrMap } from "./router/error";

export type { TDefaultCtx, LogLevel, TMiddleware };
export { CtxRouter, CtxError, ctxErrMap, DEFAULT_USER_ROLE };

export namespace adapter {
  export const enrichFromExpress = enrichFromExpressImpl;
  // Future: enrichFromLambda, enrichFromGRPC, etc.
}
