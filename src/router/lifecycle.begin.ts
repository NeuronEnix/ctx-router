import { TRouterInstance, getNextSeq, incrementInflight } from "./instance";
import { STATS } from "../common/const";
import { TDefaultCtx, CtxUser } from "../core";

/**
 * Begins a new request lifecycle by creating context with default values.
 * Increments INFLIGHT counter and SEQ for this router instance.
 *
 * This is the first step in the three-phase request lifecycle:
 * 1. begin() - Create context, increment metrics
 * 2. exec() - Execute route handler
 * 3. end() - Finalize context, decrement metrics
 *
 * @param instance - Router instance data
 * @returns A new context with default values and router INSTANCE data
 */
export function begin<TContext extends TDefaultCtx>(
  instance: TRouterInstance
): TContext {
  const inTime = Date.now();
  const seq = getNextSeq(instance);
  incrementInflight(instance);

  const traceId = `${instance.ID}-${seq}`;
  const spanId = `${instance.ID}-${seq}`;

  // Build default user (anonymous)
  const user: CtxUser = {
    kind: "user",
    id: "none",
    role: ["none"],
    scope: [],
    handle: null,
  };

  // Build ctx with defaults
  const ctx: TDefaultCtx = {
    id: traceId,
    req: {
      data: {},
      route: "PENDING", // Router will set in exec
      routeValue: "PENDING", // Adapter will set
      transport: {
        protocol: "unknown",
        raw: null,
      },
    },
    res: {
      code: "OK",
      msg: "OK",
      data: {},
    },
    err: null,
    user,
    meta: {
      serviceName: instance.SERVICE_NAME,
      instance: {
        id: instance.ID,
        createdAt: instance.CREATED_AT,
        seq,
        inflight: instance.INFLIGHT,
        cpu: STATS.cpu,
        mem: STATS.mem,
      },
      ts: {
        in: inTime,
        clientIn: inTime,
        out: 0,
        execTime: 0,
        owd: 0,
      },
      monitor: {
        traceId,
        spanId,
      },
      log: {
        stdout: [],
        db: [],
      },
    },
  };

  return ctx as TContext;
}
