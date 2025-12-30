import { TDefaultCtx, USER_ROLE } from "./ctx/ctx.types";
import { transformFromExpress } from "./transform/fromExpress";
import { CtxRouter, LogLevel } from "./ctx/ctx.router";
import { CtxError, ctxErrMap } from "./ctx/ctx.err";
export type { TDefaultCtx, LogLevel };
export { CtxRouter, CtxError, ctxErrMap, USER_ROLE };

export namespace toCtx {
  export const fromExpress = transformFromExpress;
}
