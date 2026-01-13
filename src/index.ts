import { TDefaultCtx, DEFAULT_USER_ROLE } from "./core";
import { enrichFromExpress as enrichFromExpressImpl } from "./adapter/express.v5";
import { CtxRouter, LogLevel } from "./router";
import { CtxError, ctxErrMap } from "./router/error";
import {
  buildRoute as buildRouteImpl,
  parseRoute as parseRouteImpl,
  isCanonicalRoute as isCanonicalRouteImpl,
  type RouteProtocol,
  type RouteSegments,
} from "./router/route";

export type { TDefaultCtx, LogLevel, RouteProtocol, RouteSegments };
export { CtxRouter, CtxError, ctxErrMap, DEFAULT_USER_ROLE };

export namespace adapter {
  export const enrichFromExpress = enrichFromExpressImpl;
  // Future: enrichFromLambda, enrichFromGRPC, etc.
}

export namespace route {
  export const buildRoute = buildRouteImpl;
  export const parseRoute = parseRouteImpl;
  export const isCanonicalRoute = isCanonicalRouteImpl;
}
