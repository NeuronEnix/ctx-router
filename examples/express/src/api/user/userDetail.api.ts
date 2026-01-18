import { TCtx, DEFAULT_USER_ROLE, resErr } from "../../router";

export async function execute(reqData: TReqData): Promise<TResData> {
  return {
    userDetail: {
      userId: reqData.userId,
      userName: "my-name",
    },
  };
}

export async function auth(ctx: TCtx): Promise<TCtx> {
  // authenticate the request, and return the context if the request is authenticated
  // await authRequest(ctx);
  const allowedRoles: Array<keyof typeof DEFAULT_USER_ROLE> = [
    DEFAULT_USER_ROLE.user,
    DEFAULT_USER_ROLE.admin,
  ];
  if (ctx.user.role.some((r) => allowedRoles.includes(r))) return ctx;
  throw resErr.auth.UNAUTHORIZED();
}

export async function validate(_ctx: TCtx): Promise<TReqData> {
  // Route params are automatically merged into req.data by the router
  return {
    userId: "user_123",
  };
}

type TReqData = {
  userId: string;
};
type TResData = {
  userDetail: {
    userId: string;
    userName: string;
  };
};
