import { TDefaultCtx, DEFAULT_USER_ROLE } from "./core";
import { enrichFromExpress as enrichFromExpressImpl } from "./adapter/express.v5";
import { CtxRouter, LogLevel, TMiddleware } from "./router";
import {
  CtxBaseError as BaseError,
  ctxErrMap as ErrMap,
  CtxRouterError as RouterError,
  TCtxBaseError as BaseErrorType,
} from "./router/error";
export type { TDefaultCtx, LogLevel, TMiddleware };
export { CtxRouter, DEFAULT_USER_ROLE };

export namespace err {
  export const CtxBaseError = BaseError;
  export const CtxRouterError = RouterError;
  export const ctxErrMap = ErrMap;
  export type TCtxBaseError = BaseErrorType;
}
export namespace adapter {
  export const enrichFromExpress = enrichFromExpressImpl;
  // Future: enrichFromLambda, enrichFromGRPC, etc.
}
