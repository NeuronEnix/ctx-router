import { TDefaultCtx, DEFAULT_USER_ROLE } from "./core";
import { transformFromExpress } from "./transform/fromExpress";
import { CtxRouter, LogLevel } from "./router";
import { CtxError, ctxErrMap } from "./error";
export type { TDefaultCtx, LogLevel };
export { CtxRouter, CtxError, ctxErrMap, DEFAULT_USER_ROLE };

export namespace toCtx {
  export const fromExpress = transformFromExpress;
}
