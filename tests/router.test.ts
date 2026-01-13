import { describe, it, expect, beforeEach } from "vitest";
import { CtxRouter } from "../src/router/router";
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

  describe("createCtx()", () => {
    it("creates context with default values", () => {
      const ctx = router.createCtx();

      expect(ctx.id).toBe("PENDING"); // Set in exec()
      expect(ctx.meta.monitor.traceId).toBe("PENDING");
      expect(ctx.meta.monitor.spanId).toBe("PENDING");
    });

    it("does not increment SEQ or INFLIGHT", () => {
      expect(router.INSTANCE.SEQ).toBe(0);
      expect(router.INSTANCE.INFLIGHT).toBe(0);

      router.createCtx();
      router.createCtx();

      expect(router.INSTANCE.SEQ).toBe(0);
      expect(router.INSTANCE.INFLIGHT).toBe(0);
    });

    it("creates context with default user", () => {
      const ctx = router.createCtx();

      expect(ctx.user).toEqual({
        kind: "user",
        id: "none",
        role: ["none"],
        scope: [],
        handle: null,
      });
    });

    it("creates context with default response", () => {
      const ctx = router.createCtx();

      expect(ctx.res).toEqual({
        code: "OK",
        msg: "OK",
        data: {},
      });
    });

    it("sets placeholder timing metadata", () => {
      const ctx = router.createCtx();

      expect(ctx.meta.ts.in).toBe(-1); // Set in exec()
      expect(ctx.meta.ts.out).toBe(-1);
      expect(ctx.meta.ts.execTime).toBe(-1);
    });
  });

  describe("handle()", () => {
    it("registers a route handler", async () => {
      router.handle("GET /test", async (ctx) => {
        ctx.res.data = { success: true };
        return ctx;
      });

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /test";
      ctx.req.route = "GET /test";

      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ success: true });
    });

    it("supports path parameters", async () => {
      router.handle("GET /user/:userId", async (ctx) => {
        ctx.res.data = { userId: ctx.req.params?.userId };
        return ctx;
      });

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /user/123";
      ctx.req.route = "GET /user/123";

      await router.exec(ctx);

      expect(ctx.req.params?.userId).toBe("123");
      expect(ctx.res.data).toEqual({ userId: "123" });
    });
  });

  describe("exec()", () => {
    it("throws HANDLER_NOT_FOUND for unregistered route", async () => {
      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /unknown";
      ctx.req.route = "GET /unknown";

      await router.exec(ctx);

      expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
    });

    it("executes matching handler", async () => {
      router.handle("POST /data", async (ctx) => {
        ctx.res.data = { received: true };
        return ctx;
      });

      const ctx = router.createCtx();
      ctx.req.routeValue = "POST /data";
      ctx.req.route = "POST /data";

      await router.exec(ctx);

      expect(ctx.res.code).toBe("OK");
      expect(ctx.res.data).toEqual({ received: true });
    });

    it("updates route to pattern after matching", async () => {
      router.handle("GET /item/:id", async (ctx) => ctx);

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /item/456";
      ctx.req.route = "GET /item/456";

      await router.exec(ctx);

      expect(ctx.req.route).toBe("GET /item/:id");
    });

    it("sets timing metadata after execution", async () => {
      router.handle("GET /test", async (ctx) => ctx);

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /test";

      await router.exec(ctx);

      expect(ctx.meta.ts.in).toBeGreaterThan(0);
      expect(ctx.meta.ts.out).toBeGreaterThan(0);
      expect(ctx.meta.ts.execTime).toBeGreaterThanOrEqual(0);
    });

    it("sets response meta after execution", async () => {
      router.handle("GET /test", async (ctx) => ctx);

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /test";

      await router.exec(ctx);

      expect(ctx.res.meta).toBeDefined();
      expect(ctx.res.meta?.ctxId).toMatch(/^[a-f0-9]+-1$/);
      expect(ctx.res.meta?.traceId).toBe(ctx.id);
    });

    it("increments and decrements INFLIGHT during execution", async () => {
      router.handle("GET /test", async (ctx) => {
        expect(router.INSTANCE.INFLIGHT).toBe(1);
        return ctx;
      });

      expect(router.INSTANCE.INFLIGHT).toBe(0);

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /test";

      await router.exec(ctx);

      expect(router.INSTANCE.INFLIGHT).toBe(0);
    });
  });

  describe("hooks", () => {
    it("calls onExecBefore hook", async () => {
      let hookCalled = false;

      router.hookOnExecBefore(async (ctx) => {
        hookCalled = true;
        return ctx;
      });

      router.handle("GET /test", async (ctx) => ctx);

      const ctx = router.createCtx();
      ctx.req.routeValue = "GET /test";
      ctx.req.route = "GET /test";

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });
  });
});
