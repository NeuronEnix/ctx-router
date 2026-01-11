import { describe, it, expect, beforeEach } from "vitest";
import { CtxRouter } from "../src/router";
import { TDefaultCtx } from "../src/core";

describe("CtxRouter", () => {
  let router: CtxRouter<TDefaultCtx>;

  beforeEach(() => {
    router = new CtxRouter<TDefaultCtx>({ logLevel: "none" });
  });

  describe("INSTANCE", () => {
    it("generates unique ID for each router instance", () => {
      const router2 = new CtxRouter<TDefaultCtx>();

      expect(router.INSTANCE.ID).toBeDefined();
      expect(router2.INSTANCE.ID).toBeDefined();
      expect(router.INSTANCE.ID).not.toBe(router2.INSTANCE.ID);
    });

    it("initializes SEQ and INFLIGHT to 0", () => {
      expect(router.INSTANCE.SEQ).toBe(0);
      expect(router.INSTANCE.INFLIGHT).toBe(0);
    });

    it("sets CREATED_AT timestamp", () => {
      expect(router.INSTANCE.CREATED_AT).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("begin()", () => {
    it("creates context with traceId", () => {
      const ctx = router.begin();

      expect(ctx.id).toMatch(/^[a-f0-9]+-1$/);
      expect(ctx.meta.monitor.traceId).toBe(ctx.id);
      expect(ctx.meta.monitor.spanId).toBe(ctx.id);
    });

    it("increments SEQ for each begin call", () => {
      expect(router.INSTANCE.SEQ).toBe(0);

      router.begin();
      expect(router.INSTANCE.SEQ).toBe(1);

      router.begin();
      expect(router.INSTANCE.SEQ).toBe(2);
    });

    it("increments INFLIGHT on begin", () => {
      expect(router.INSTANCE.INFLIGHT).toBe(0);

      router.begin();
      expect(router.INSTANCE.INFLIGHT).toBe(1);

      router.begin();
      expect(router.INSTANCE.INFLIGHT).toBe(2);
    });

    it("creates context with default user", () => {
      const ctx = router.begin();

      expect(ctx.user).toEqual({
        kind: "user",
        id: "none",
        role: ["none"],
        scope: [],
        handle: null,
      });
    });

    it("creates context with default response", () => {
      const ctx = router.begin();

      expect(ctx.res).toEqual({
        code: "OK",
        msg: "OK",
        data: {},
      });
    });

    it("sets timestamp metadata", () => {
      const before = Date.now();
      const ctx = router.begin();
      const after = Date.now();

      expect(ctx.meta.ts.in).toBeGreaterThanOrEqual(before);
      expect(ctx.meta.ts.in).toBeLessThanOrEqual(after);
    });
  });

  describe("end()", () => {
    it("decrements INFLIGHT", () => {
      const ctx = router.begin();
      expect(router.INSTANCE.INFLIGHT).toBe(1);

      router.end(ctx);
      expect(router.INSTANCE.INFLIGHT).toBe(0);
    });

    it("sets output timestamp", () => {
      const ctx = router.begin();
      expect(ctx.meta.ts.out).toBe(0);

      router.end(ctx);
      expect(ctx.meta.ts.out).toBeGreaterThan(0);
    });

    it("calculates execTime", () => {
      const ctx = router.begin();

      router.end(ctx);

      expect(ctx.meta.ts.execTime).toBeGreaterThanOrEqual(0);
      expect(ctx.meta.ts.execTime).toBe(ctx.meta.ts.out - ctx.meta.ts.in);
    });

    it("sets response meta", () => {
      const ctx = router.begin();

      router.end(ctx);

      expect(ctx.res.meta).toBeDefined();
      expect(ctx.res.meta?.ctxId).toBe(ctx.id);
      expect(ctx.res.meta?.traceId).toBe(ctx.meta.monitor.traceId);
    });
  });

  describe("handle()", () => {
    it("registers a route handler", async () => {
      router.handle("GET /test", async (ctx) => {
        ctx.res.data = { success: true };
        return ctx;
      });

      const ctx = router.begin();
      ctx.req.route = "GET /test";
      ctx.req.routePattern = "GET /test";

      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ success: true });
    });

    it("supports path parameters", async () => {
      router.handle("GET /user/:userId", async (ctx) => {
        ctx.res.data = { userId: ctx.req.data.userId };
        return ctx;
      });

      const ctx = router.begin();
      ctx.req.route = "GET /user/123";
      ctx.req.routePattern = "GET /user/123";

      await router.exec(ctx);

      expect(ctx.req.data.userId).toBe("123");
      expect(ctx.res.data).toEqual({ userId: "123" });
    });
  });

  describe("exec()", () => {
    it("throws HANDLER_NOT_FOUND for unregistered route", async () => {
      const ctx = router.begin();
      ctx.req.route = "GET /unknown";
      ctx.req.routePattern = "GET /unknown";

      await router.exec(ctx);

      expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
    });

    it("executes matching handler", async () => {
      router.handle("POST /data", async (ctx) => {
        ctx.res.data = { received: true };
        return ctx;
      });

      const ctx = router.begin();
      ctx.req.route = "POST /data";
      ctx.req.routePattern = "POST /data";

      await router.exec(ctx);

      expect(ctx.res.code).toBe("OK");
      expect(ctx.res.data).toEqual({ received: true });
    });

    it("updates routePattern after matching", async () => {
      router.handle("GET /item/:id", async (ctx) => ctx);

      const ctx = router.begin();
      ctx.req.route = "GET /item/456";
      ctx.req.routePattern = "GET /item/456";

      await router.exec(ctx);

      expect(ctx.req.routePattern).toBe("GET /item/:id");
    });
  });

  describe("hooks", () => {
    it("calls alterContext hook", async () => {
      let hookCalled = false;

      router.hookAlterContext(async (ctx) => {
        hookCalled = true;
        return ctx;
      });

      router.handle("GET /test", async (ctx) => ctx);

      const ctx = router.begin();
      ctx.req.route = "GET /test";
      ctx.req.routePattern = "GET /test";

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });
  });
});
