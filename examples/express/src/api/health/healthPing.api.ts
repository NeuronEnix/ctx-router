import { TCtx } from "../../router";

export async function execute(reqData: TReqData): Promise<TResData> {
  const pongAt = new Date();
  return {
    pingAt: reqData.pingAt,
    pongAt,
  };
}

export async function auth(ctx: TCtx): Promise<TCtx> {
  return ctx;
}

export async function validate(ctx: TCtx): Promise<TReqData> {
  return ctx.req.data as TReqData;
}

type TReqData = {
  userId: string;
  pingAt: Date;
};
type TResData = {
  pingAt: Date;
  pongAt: Date;
};
