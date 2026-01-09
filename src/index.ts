import { TDefaultCtx, DEFAULT_USER_ROLE } from "./core";
import { enrichFromExpress as enrichFromExpressImpl } from "./adapter/express.v5";
import { CtxRouter, LogLevel } from "./router";
import { CtxError, ctxErrMap } from "./error";

export type { TDefaultCtx, LogLevel };
export { CtxRouter, CtxError, ctxErrMap, DEFAULT_USER_ROLE };

export namespace adapter {
  export const enrichFromExpress = enrichFromExpressImpl;
  // Future: enrichFromLambda, enrichFromGRPC, etc.
}

// DEPRECATED: Keep for backward compatibility, remove in next major version
export namespace toCtx {
  export const fromExpress = (_req: unknown) => {
    throw new Error(
      "toCtx.fromExpress is deprecated. Use router.getNewCtx() + adapter.enrichFromExpress(ctx, req)"
    );
  };
}
