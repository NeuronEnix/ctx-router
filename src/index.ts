import { TDefaultCtx } from "./ctx/ctx.types";
import { transformFromExpress } from "./transform/fromExpress";
import { CtxRouter } from "./ctx/ctx.router";
import { CtxError, ctxErrMap } from "./ctx/ctx.err";
export type { TDefaultCtx };
export { CtxRouter, CtxError, ctxErrMap };

export namespace toCtx {
  export const fromExpress = transformFromExpress;
}
