type TCtxErrorData = {
  [key: string]: number | string | object | boolean | null;
};
type TCtxError = {
  name: string; // error name | constant (unique and capitalized)
  msg: string; // Human readable error message
  data?: TCtxErrorData; // non sensitive data that can be sent back to client
  info?: unknown; // error info (for debugging that will be logged internally)
};
export class CtxError extends Error {
  data: { [key: string]: number | string | object | boolean | null };
  info?: unknown;
  constructor({ name, msg, data, info }: TCtxError) {
    super(msg);
    super.name = name;
    this.data = data || {};
    this.info = info;
  }
}

type TResErr = Partial<Pick<TCtxError, "data" | "info" | "msg">>;

// Factory function to create error instances
function createError(key: string, msg: string, e?: TResErr): CtxError {
  return new CtxError({
    name: key,
    msg: msg,
    ...e,
  });
}

export function ctxErrMap<T extends Record<string, Record<string, string>>>(
  errKeyMsg: T
) {
  return Object.fromEntries(
    Object.keys(errKeyMsg).map((category) => [
      category,
      Object.fromEntries(
        Object.keys(
          errKeyMsg[category as keyof T] as Record<string, string>
        ).map((key) => [
          key,
          (e?: TResErr) =>
            createError(key, errKeyMsg[category as keyof T]![key] as string, e),
        ])
      ),
    ])
  ) as {
    [K in keyof T]: {
      [P in keyof T[K]]: (e?: TResErr) => CtxError;
    };
  };
}
