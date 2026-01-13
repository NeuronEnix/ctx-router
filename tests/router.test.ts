import { describe, it, expect, beforeEach } from "vitest";
import { CtxRouter } from "../src/router/router";
import { TDefaultCtx } from "../src/core";

function setRoute(
  ctx: TDefaultCtx,
  action: string,
  path: string,
  protocol = "http"
): void {
  ctx.req.route = {
    action,
    pattern: path,
    original: path,
  };
  ctx.req.transport = {
    protocol,
    raw: null,
  };
}

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
      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/test",
        handler: async (ctx) => {
          ctx.res.data = { success: true };
          return ctx;
        },
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ success: true });
    });

    it("supports path parameters", async () => {
      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/user/:userId",
        handler: async (ctx) => {
          ctx.res.data = { userId: ctx.req.params?.userId };
          return ctx;
        },
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/user/123");

      await router.exec(ctx);

      expect(ctx.req.params?.userId).toBe("123");
      expect(ctx.res.data).toEqual({ userId: "123" });
    });
  });

  describe("exec()", () => {
    it("throws HANDLER_NOT_FOUND for unregistered route", async () => {
      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/unknown");

      await router.exec(ctx);

      expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
    });

    it("executes matching handler", async () => {
      router.handle({
        protocol: "http",
        action: "POST",
        pattern: "/data",
        handler: async (ctx) => {
          ctx.res.data = { received: true };
          return ctx;
        },
      });

      const ctx = router.createCtx();
      setRoute(ctx, "POST", "/data");

      await router.exec(ctx);

      expect(ctx.res.code).toBe("OK");
      expect(ctx.res.data).toEqual({ received: true });
    });

    it("updates route to pattern after matching", async () => {
      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/item/:id",
        handler: async (ctx) => ctx,
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/item/456");

      await router.exec(ctx);

      expect(ctx.req.route.pattern).toBe("/item/:id");
    });

    it("sets timing metadata after execution", async () => {
      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/test",
        handler: async (ctx) => ctx,
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.meta.ts.in).toBeGreaterThan(0);
      expect(ctx.meta.ts.out).toBeGreaterThan(0);
      expect(ctx.meta.ts.execTime).toBeGreaterThanOrEqual(0);
    });

    it("sets response meta after execution", async () => {
      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/test",
        handler: async (ctx) => ctx,
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.res.meta).toBeDefined();
      expect(ctx.res.meta?.ctxId).toMatch(/^[a-f0-9]+-1$/);
      expect(ctx.res.meta?.traceId).toBe(ctx.id);
    });

    it("increments and decrements INFLIGHT during execution", async () => {
      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/test",
        handler: async (ctx) => {
          expect(router.INSTANCE.INFLIGHT).toBe(1);
          return ctx;
        },
      });

      expect(router.INSTANCE.INFLIGHT).toBe(0);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(router.INSTANCE.INFLIGHT).toBe(0);
    });

    describe("protocol-aware routing", () => {
      it("throws HANDLER_NOT_FOUND on protocol mismatch", async () => {
        router.handle({
          protocol: "http",
          action: "GET",
          pattern: "/test",
          handler: async (ctx) => {
            ctx.res.data = { protocol: "http" };
            return ctx;
          },
        });

        const ctx = router.createCtx();
        setRoute(ctx, "GET", "/test", "grpc");

        await router.exec(ctx);

        expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
      });

      it("throws HANDLER_NOT_FOUND on action mismatch", async () => {
        router.handle({
          protocol: "http",
          action: "GET",
          pattern: "/test",
          handler: async (ctx) => {
            ctx.res.data = { action: "GET" };
            return ctx;
          },
        });

        const ctx = router.createCtx();
        setRoute(ctx, "POST", "/test");

        await router.exec(ctx);

        expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
      });

      it("matches wildcard action when route has no action", async () => {
        router.handle({
          protocol: "http",
          pattern: "/wildcard",
          handler: async (ctx) => {
            ctx.res.data = { wildcard: true };
            return ctx;
          },
        });

        const ctx = router.createCtx();
        setRoute(ctx, "POST", "/wildcard");

        await router.exec(ctx);

        expect(ctx.res.code).toBe("OK");
        expect(ctx.res.data).toEqual({ wildcard: true });
      });

      it("precedence: exact action wins over wildcard", async () => {
        // Register wildcard first
        router.handle({
          protocol: "http",
          pattern: "/item/:id",
          handler: async (ctx) => {
            ctx.res.data = { matched: "wildcard" };
            return ctx;
          },
        });

        // Register exact action second
        router.handle({
          protocol: "http",
          action: "GET",
          pattern: "/item/:id",
          handler: async (ctx) => {
            ctx.res.data = { matched: "exact" };
            return ctx;
          },
        });

        const ctx = router.createCtx();
        setRoute(ctx, "GET", "/item/123");

        await router.exec(ctx);

        expect(ctx.res.code).toBe("OK");
        expect(ctx.res.data).toEqual({ matched: "exact" });
      });

      it("supports mixed protocols with same pattern", async () => {
        router.handle({
          protocol: "http",
          action: "GET",
          pattern: "/data",
          handler: async (ctx) => {
            ctx.res.data = { protocol: "http" };
            return ctx;
          },
        });

        router.handle({
          protocol: "grpc",
          action: "GetData",
          pattern: "/data",
          handler: async (ctx) => {
            ctx.res.data = { protocol: "grpc" };
            return ctx;
          },
        });

        const httpCtx = router.createCtx();
        setRoute(httpCtx, "GET", "/data", "http");
        await router.exec(httpCtx);

        expect(httpCtx.res.code).toBe("OK");
        expect(httpCtx.res.data).toEqual({ protocol: "http" });

        const grpcCtx = router.createCtx();
        setRoute(grpcCtx, "GetData", "/data", "grpc");
        await router.exec(grpcCtx);

        expect(grpcCtx.res.code).toBe("OK");
        expect(grpcCtx.res.data).toEqual({ protocol: "grpc" });
      });
    });
  });

  describe("hooks", () => {
    it("calls onExecBefore hook", async () => {
      let hookCalled = false;

      router.hookOnExecBefore(async (ctx) => {
        hookCalled = true;
        return ctx;
      });

      router.handle({
        protocol: "http",
        action: "GET",
        pattern: "/test",
        handler: async (ctx) => ctx,
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });
  });

  describe("configuration", () => {
    describe("logLevel", () => {
      it("defaults to standard", () => {
        const defaultRouter = new CtxRouter<TDefaultCtx>();
        expect(defaultRouter.logLevel).toBe("standard");
      });

      it("accepts custom logLevel", () => {
        const verboseRouter = new CtxRouter<TDefaultCtx>({ logLevel: "verbose" });
        expect(verboseRouter.logLevel).toBe("verbose");

        const minimalRouter = new CtxRouter<TDefaultCtx>({ logLevel: "minimal" });
        expect(minimalRouter.logLevel).toBe("minimal");

        const noneRouter = new CtxRouter<TDefaultCtx>({ logLevel: "none" });
        expect(noneRouter.logLevel).toBe("none");
      });
    });

    describe("statsEnabled", () => {
      it("defaults to true", () => {
        const defaultRouter = new CtxRouter<TDefaultCtx>();
        expect(defaultRouter.statsEnabled).toBe(true);
      });

      it("accepts statsEnabled: false", () => {
        const noStatsRouter = new CtxRouter<TDefaultCtx>({ statsEnabled: false });
        expect(noStatsRouter.statsEnabled).toBe(false);
      });

      it("accepts statsEnabled: true explicitly", () => {
        const statsRouter = new CtxRouter<TDefaultCtx>({ statsEnabled: true });
        expect(statsRouter.statsEnabled).toBe(true);
      });

      it("executes handler successfully with stats disabled", async () => {
        const noStatsRouter = new CtxRouter<TDefaultCtx>({
          statsEnabled: false,
          logLevel: "none",
        });

        noStatsRouter.handle({
          protocol: "http",
          action: "GET",
          pattern: "/test",
          handler: async (ctx) => {
            ctx.res.data = { success: true };
            return ctx;
          },
        });

        const ctx = noStatsRouter.createCtx();
        setRoute(ctx, "GET", "/test");

        await noStatsRouter.exec(ctx);

        expect(ctx.res.code).toBe("OK");
        expect(ctx.res.data).toEqual({ success: true });
        // Stats should still have default values (-1) or be populated
        // The test verifies execution works regardless of statsEnabled
        expect(ctx.meta.ts.in).toBeGreaterThan(0);
      });

      it("sets instance metrics regardless of statsEnabled", async () => {
        const noStatsRouter = new CtxRouter<TDefaultCtx>({
          statsEnabled: false,
          logLevel: "none",
        });

        noStatsRouter.handle({
          protocol: "http",
          action: "GET",
          pattern: "/test",
          handler: async (ctx) => ctx,
        });

        const ctx = noStatsRouter.createCtx();
        setRoute(ctx, "GET", "/test");

        await noStatsRouter.exec(ctx);

        // Instance-level metrics should still be set
        expect(ctx.meta.instance.seq).toBeGreaterThan(0);
        expect(ctx.meta.instance.id).toBeDefined();
        // Context captures inflight at exec start (1), router's INSTANCE is decremented after
        expect(noStatsRouter.INSTANCE.INFLIGHT).toBe(0);
      });
    });

    it("accepts combined configuration", () => {
      const customRouter = new CtxRouter<TDefaultCtx>({
        logLevel: "verbose",
        statsEnabled: false,
      });

      expect(customRouter.logLevel).toBe("verbose");
      expect(customRouter.statsEnabled).toBe(false);
    });
  });
});
