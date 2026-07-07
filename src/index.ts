import {
  TDefaultCtx,
  DEFAULT_USER_ROLE,
  CtxReq,
  CtxRes,
  CtxUser,
  CtxMeta,
} from "./core";
import { CtxResMeta } from "./core/res";
import { enrichFromExpress as enrichFromExpressImpl } from "./adapter/express.v5";
import { CtxRouter, TCtxConsumerFn, TRouteBuilder } from "./router";
import {
  CtxBaseError,
  ctxErrMap,
  CtxRouterError,
  TCtxBaseError,
} from "./router/error";

export { CtxRouter, DEFAULT_USER_ROLE };

export namespace CtxType {
  export type DefaultCtx = TDefaultCtx;
  export type Req = CtxReq;
  export type Res = CtxRes;
  export type ResMeta = CtxResMeta;
  export type User = CtxUser;
  export type Meta = CtxMeta;
  export type CtxConsumerFn<TUserCtx extends TDefaultCtx> =
    TCtxConsumerFn<TUserCtx>;
  export type RouteBuilder<TUserCtx extends TDefaultCtx> =
    TRouteBuilder<TUserCtx>;
  export type RouterError = CtxRouterError;
  export type BaseError = TCtxBaseError;
}
export namespace CtxErr {
  export const BaseError = CtxBaseError;
  export const RouterError = CtxRouterError;
  export const errMap = ctxErrMap;
}
export namespace CtxAdapter {
  export const enrichFromExpress = enrichFromExpressImpl;
  // Future: enrichFromLambda, enrichFromGRPC, etc.
}
