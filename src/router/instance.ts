import crypto from "crypto";

export type TRouterInstance = {
  ID: string;
  TRACE_ID: string;
  CREATED_AT: number;
  SERVICE_NAME: string;
  SEQ: number;
  INFLIGHT: number;
  LAST_HEARTBEAT: number;
};

export function createRouterInstance(serviceName?: string): TRouterInstance {
  return {
    ID: crypto.randomBytes(5).toString("hex"),
    TRACE_ID: crypto.randomBytes(5).toString("hex"),
    CREATED_AT: Date.now(),
    SERVICE_NAME: serviceName ?? "ctx-service",
    SEQ: 0,
    INFLIGHT: 0,
    LAST_HEARTBEAT: Date.now(),
  };
}

export function incrementInflight(instance: TRouterInstance): number {
  return ++instance.INFLIGHT;
}

export function decrementInflight(instance: TRouterInstance): number {
  return --instance.INFLIGHT;
}

export function getNextSeq(instance: TRouterInstance): number {
  return ++instance.SEQ;
}
