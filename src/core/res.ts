type CtxResMeta = {
  ctxId: string;
  seq: number;
  traceId: string;
  spanId: string;
  inTime: number;
  outTime: number;
  execTime: number;
  owd: number;
};

export type CtxRes = {
  code: string; // OK, ERROR, USER_NOT_FOUND, only OK is successful, rest are errors
  msg: string; // to show to user human readble
  data: Record<string, unknown>; // the actual response data that goes in body or something to be sent back
  meta?: CtxResMeta; // few metadata of current request, optional to send only for admin user they will find this in response, actual user will not see this in response
};
