import { TCtx } from "../../router";

import * as userUpdate from "./userUpdate.api";
import * as userDetail from "./userDetail.api";

export async function update(ctx: TCtx) {
  const { auth, validate, execute } = userUpdate;
  ctx.res.data = await auth(ctx).then(validate).then(execute);
  return ctx;
}

export async function detail(ctx: TCtx) {
  const { auth, validate, execute } = userDetail;
  ctx.res.data = await auth(ctx).then(validate).then(execute);
  return ctx;
}
