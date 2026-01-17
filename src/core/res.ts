/**
 * Response metadata type (available for adapters to wrap responses).
 * Not included in core CtxRes - adapters can optionally add this to transport-specific envelopes.
 */
export type CtxResMeta = {
  ctxId?: string;
  seq?: number;
  traceId?: string;
  spanId?: string;
  inTime?: number;
  outTime?: number;
  execTime?: number;
  owd?: number;
};

export type CtxRes = {
  /**
   * Domain-level outcome code (transport-agnostic).
   * Examples: "OK", "ERROR", "USER_NOT_FOUND"
   * Only "OK" is considered successful, all others are errors.
   * Note: This does NOT imply HTTP status mapping. Adapters map this to transport-specific codes.
   */
  code: string;
  msg: string; // Human-readable message for the user
  data: Record<string, unknown>; // The actual response data
};
