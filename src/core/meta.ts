/**
 * System-owned metadata describing runtime, timing, tracing, and logs
 * for the current execution context.
 */
export type CtxMeta = {
  /** Name of the running service (payment, payout, identity, etc.) */
  readonly serviceName: string;

  /** Runtime instance information */
  readonly instance: {
    /** Unique identifier of the instance */
    readonly id: string;

    /** Instance creation time (epoch ms) */
    readonly createdAt: number;

    /** Monotonic sequence number for this instance */
    readonly seq: number;

    /** In-flight executions when this request arrived */
    readonly inflight: number;

    /** CPU usage percentage, or -1 if unavailable */
    readonly cpu: number;

    /** Memory usage in MB, or -1 if unavailable */
    readonly mem: number;
  };

  /** Execution timestamps (epoch ms, -1 if unavailable) */
  ts: {
    /** When execution entered the system */
    readonly in: number;

    /** When the client sent the request */
    readonly clientIn: number;

    /** When execution completed */
    out: number;

    /** Total execution time in ms */
    execTime: number;

    /** One-way network delay in ms */
    readonly owd: number;
  };

  /** Distributed tracing identifiers */
  readonly monitor: {
    /** Trace identifier (origin-assigned, always present) */
    readonly traceId: string;

    /** Span identifier for this execution */
    readonly spanId: string;
  };

  /** Logs collected during execution */
  readonly log?: {
    /** Standard output logs */
    readonly stdout: readonly string[];

    /** Database query logs */
    readonly db?: readonly {
      readonly q: string;
      readonly p: readonly unknown[];
      readonly ms: number;
    }[];
  };
};
