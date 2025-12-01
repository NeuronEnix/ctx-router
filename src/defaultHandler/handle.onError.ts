import { CtxError } from "../ctx/ctx.err";
import { TDefaultCtx } from "../ctx/ctx.types";

export async function handleOnError<TContext extends TDefaultCtx>(
  ctx: TContext,
  e: CtxError | Error | unknown
): Promise<TContext> {
  if (e instanceof CtxError) {
    console.log("CtxError:name:", e.name);
    console.log("CtxError:message:", e.message);
    console.log("CtxError:data:", e.data);
    if (e.info) {
      ctx.res.info = e.info;
    }
    if (typeof e.info === "object") {
      console.log("CtxError:info:object:", JSON.stringify(e.info));
    } else {
      console.log("CtxError:info:", e.info);
    }
    if (e.stack) {
      console.log("CtxError:stack:", e.stack);
    }
    ctx.res = { code: e.name, msg: e.message, data: e.data };
    return ctx;
  }

  // ideally should never come here, god forbid it did
  console.log("CtxError:unknown:fatal", e);
  const error = new CtxError({
    name: "UNKNOWN_ERROR",
    msg: "Something went wrong",
  });
  ctx.res = {
    code: error.name,
    msg: error.message,
    data: {},
  };
  return ctx;
}
