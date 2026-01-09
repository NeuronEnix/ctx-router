import { CtxError } from "../error";
import { TDefaultCtx } from "../core";

export async function defaultHookExecError<TContext extends TDefaultCtx>(
  ctx: TContext,
  e: CtxError | Error | unknown
): Promise<TContext> {
  if (e instanceof CtxError) {
    console.log("CtxError:name:", e.name);
    console.log("CtxError:message:", e.message);
    console.log("CtxError:data:", e.data);
    if (e.info) {
      if (typeof e.info === "object") {
        console.log("CtxError:info:object:", JSON.stringify(e.info));
      } else {
        console.log("CtxError:info:", e.info);
      }
    }
    if (e.stack) {
      console.log("CtxError:stack:", e.stack);
    }

    // Store error in ctx.err for internal tracking
    ctx.err = e;

    // Set response (client-safe data only)
    ctx.res = { code: e.name, msg: e.message, data: e.data };
    return ctx;
  }

  // ideally should never come here, god forbid it did
  console.log("CtxError:UKNOWN_ERROR:FATAL", e);
  const error = new CtxError({
    name: "UNKNOWN_ERROR",
    msg: "Something went wrong",
  });

  // Store error in ctx.err
  ctx.err = error;

  ctx.res = {
    code: error.name,
    msg: error.message,
    data: {},
  };
  return ctx;
}
