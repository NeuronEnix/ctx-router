import crypto from "crypto";

export type TRouterInstance = {
  ID: string;
  CREATED_AT: number;
  SERVICE_NAME: string;
  SEQ: number;
  INFLIGHT: number;
};

export function createRouterInstance(serviceName?: string): TRouterInstance {
  return {
    ID: crypto.randomBytes(5).toString("hex"),
    CREATED_AT: Date.now(),
    SERVICE_NAME: serviceName ?? "ctx-service",
    SEQ: 0,
    INFLIGHT: 0,
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
