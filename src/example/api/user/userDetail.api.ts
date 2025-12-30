import { TCtx, USER_ROLE, ctxErr } from "../../router";

export async function execute(reqData: TReqData): Promise<TResData> {
  return {
    userDetail: {
      userId: reqData.userId,
      userName: "kaushik",
    },
  };
}

export async function auth(ctx: TCtx): Promise<TCtx> {
  // authenticate the request, and return the context if the request is authenticated
  // await authRequest(ctx);
  const allowedRoles: Array<keyof typeof USER_ROLE> = [
    USER_ROLE.USER,
    USER_ROLE.ADMIN,
  ];
  if (ctx.user.role.some((r) => allowedRoles.includes(r))) return ctx;
  throw ctxErr.auth.UNAUTHORIZED();
}

export async function validate(ctx: TCtx): Promise<TReqData> {
  // Validate request data and return the request data
  return ctx.req.data as TReqData;
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
