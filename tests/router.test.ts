import { describe, it, expect, beforeEach } from "vitest";
import { CtxRouter } from "../src/router/router";
import { TDefaultCtx } from "../src/core";

function setRoute(
  ctx: TDefaultCtx,
  op: string | undefined,
  raw: string
): void {
  ctx.req.route = {
    op,
    raw,
    pattern: "PENDING",
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

    it("accepts optional protocol parameter", () => {
      const ctx = router.createCtx("kafka");

      expect(ctx.req.transport.protocol).toBe("kafka");
    });
  });

  describe("Scoped router API", () => {
    it("on() returns a new scoped router", () => {
      const scoped = router.on("user");

      expect(scoped).toBeInstanceOf(CtxRouter);
      expect(scoped).not.toBe(router);
    });

    it("on() throws on empty segment", () => {
      expect(() => router.on("")).toThrow(
        "Router.on() requires a non-empty string segment"
      );
    });

    it("handle() throws without segments", () => {
      expect(() => router.handle(async (ctx) => ctx)).toThrow(
        "Cannot register handler without segments"
      );
    });

    it("registers a simple route", async () => {
      router.on("GET /test").handle(async (ctx) => {
        ctx.res.data = { success: true };
        return ctx;
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ success: true });
    });

    it("supports chained segments", async () => {
      router.on("user").on(":id").on("GET").handle(async (ctx) => {
        ctx.res.data = { userId: ctx.req.params?.id };
        return ctx;
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/user/123");

      await router.exec(ctx);

      expect(ctx.req.params?.id).toBe("123");
      expect(ctx.res.data).toEqual({ userId: "123" });
    });

    it("supports shared prefix routing", async () => {
      const userRouter = router.on("user");

      userRouter.on("GET /:id").handle(async (ctx) => {
        ctx.res.data = { action: "get", id: ctx.req.params?.id };
        return ctx;
      });

      userRouter.on("POST /update").handle(async (ctx) => {
        ctx.res.data = { action: "update" };
        return ctx;
      });

      const getCtx = router.createCtx();
      setRoute(getCtx, "GET", "/user/456");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ action: "get", id: "456" });

      const postCtx = router.createCtx();
      setRoute(postCtx, "POST", "/user/update");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ action: "update" });
    });
  });

  describe("HTTP grammar detection", () => {
    it("creates dual routes when HTTP grammar is present", async () => {
      router.on("job").on(":id").on("clean").on("GET").handle(async (ctx) => {
        ctx.res.data = { cleaned: ctx.req.params?.id };
        return ctx;
      });

      // Should match dot-separated pattern (non-HTTP transport)
      const ctx1 = router.createCtx();
      setRoute(ctx1, "GET", "job.123.clean");
      await router.exec(ctx1);
      expect(ctx1.req.route.pattern).toBe("job.:id.clean");
      expect(ctx1.req.params).toEqual({ id: "123" });

      // Should match slash-separated HTTP pattern
      const ctx2 = router.createCtx();
      setRoute(ctx2, "GET", "/job/456/clean");
      await router.exec(ctx2);
      expect(ctx2.req.route.pattern).toBe("/job/:id/clean");
      expect(ctx2.req.params).toEqual({ id: "456" });
    });

    it("single pattern route when no HTTP grammar", async () => {
      router.on("event").on(":name").handle(async (ctx) => {
        ctx.res.data = { event: ctx.req.params?.name };
        return ctx;
      });

      const ctx = router.createCtx();
      setRoute(ctx, undefined, "event.test");
      await router.exec(ctx);
      expect(ctx.req.route.pattern).toBe("event.:name");
      expect(ctx.req.params).toEqual({ name: "test" });
    });
  });

  describe("Route matching", () => {
    it("exact match takes precedence over pattern match", async () => {
      const exactHandler = async (ctx: TDefaultCtx) => {
        ctx.res.data = { matched: "exact" };
        return ctx;
      };

      const paramHandler = async (ctx: TDefaultCtx) => {
        ctx.res.data = { matched: "param" };
        return ctx;
      };

      router.on("job").on("clean").handle(exactHandler);
      router.on("job").on(":id").handle(paramHandler);

      const ctx = router.createCtx();
      setRoute(ctx, undefined, "job.clean");
      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ matched: "exact" });
    });

    it("matches routes with params", async () => {
      router.on("user").on(":userId").on("GET").handle(async (ctx) => {
        ctx.res.data = { userId: ctx.req.params?.userId };
        return ctx;
      });

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/user/789");

      await router.exec(ctx);

      expect(ctx.req.params?.userId).toBe("789");
      expect(ctx.res.data).toEqual({ userId: "789" });
    });

    it("updates route to pattern after matching", async () => {
      router.on("GET /item/:id").handle(async (ctx) => ctx);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/item/456");

      await router.exec(ctx);

      expect(ctx.req.route.pattern).toBe("/item/:id");
    });
  });

  describe("Operation (op) matching", () => {
    it("routes with op match only specific operation", async () => {
      router.on("GET /data").handle(async (ctx) => {
        ctx.res.data = { method: "GET" };
        return ctx;
      });

      router.on("POST /data").handle(async (ctx) => {
        ctx.res.data = { method: "POST" };
        return ctx;
      });

      const getCtx = router.createCtx();
      setRoute(getCtx, "GET", "/data");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ method: "GET" });

      const postCtx = router.createCtx();
      setRoute(postCtx, "POST", "/data");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ method: "POST" });
    });

    it("routes without op match any operation (wildcard)", async () => {
      router.on("job").on(":id").handle(async (ctx) => {
        ctx.res.data = { id: ctx.req.params?.id, op: ctx.req.route.op };
        return ctx;
      });

      // Should match any op
      const ctx1 = router.createCtx();
      setRoute(ctx1, "GET", "job.abc");
      await router.exec(ctx1);
      expect(ctx1.res.data).toEqual({ id: "abc", op: "GET" });

      const ctx2 = router.createCtx();
      setRoute(ctx2, "POST", "job.xyz");
      await router.exec(ctx2);
      expect(ctx2.res.data).toEqual({ id: "xyz", op: "POST" });

      const ctx3 = router.createCtx();
      setRoute(ctx3, undefined, "job.foo");
      await router.exec(ctx3);
      expect(ctx3.res.data).toEqual({ id: "foo", op: undefined });
    });

    it("throws HANDLER_NOT_FOUND on op mismatch", async () => {
      router.on("GET /test").handle(async (ctx) => {
        ctx.res.data = { op: "GET" };
        return ctx;
      });

      const ctx = router.createCtx();
      setRoute(ctx, "POST", "/test");

      await router.exec(ctx);

      expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
    });
  });

  describe("Cross-transport params", () => {
    it("params work across all transports", async () => {
      // Register with HTTP grammar to create both dot and slash patterns
      router.on("job").on(":resource").on("clean").on("GET").handle(async (ctx) => {
        ctx.res.data = { resource: ctx.req.params?.resource };
        return ctx;
      });

      // Kafka-style (dot separator)
      const kafkaCtx = router.createCtx("kafka");
      setRoute(kafkaCtx, "GET", "job.abc.clean");
      await router.exec(kafkaCtx);
      expect(kafkaCtx.req.params).toEqual({ resource: "abc" });

      // HTTP-style (slash separator)
      const httpCtx = router.createCtx("http");
      setRoute(httpCtx, "GET", "/job/xyz/clean");
      await router.exec(httpCtx);
      expect(httpCtx.req.params).toEqual({ resource: "xyz" });
    });
  });

  describe("Error handling", () => {
    it("throws HANDLER_NOT_FOUND for unregistered route", async () => {
      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/unknown");

      await router.exec(ctx);

      expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
    });

    it("includes route info in error data", async () => {
      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/nonexistent");

      await router.exec(ctx);

      expect(ctx.res.code).toBe("HANDLER_NOT_FOUND");
      expect(ctx.err).toBeDefined();
    });
  });

  describe("Execution lifecycle", () => {
    it("sets timing metadata after execution", async () => {
      router.on("GET /test").handle(async (ctx) => ctx);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.meta.ts.in).toBeGreaterThan(0);
      expect(ctx.meta.ts.out).toBeGreaterThan(0);
      expect(ctx.meta.ts.execTime).toBeGreaterThanOrEqual(0);
    });

    it("sets response meta after execution", async () => {
      router.on("GET /test").handle(async (ctx) => ctx);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.res.meta).toBeDefined();
      expect(ctx.res.meta?.ctxId).toMatch(/^[a-f0-9]+-1$/);
      expect(ctx.res.meta?.traceId).toBe(ctx.id);
    });

    it("increments and decrements INFLIGHT during execution", async () => {
      router.on("GET /test").handle(async (ctx) => {
        expect(router.INSTANCE.INFLIGHT).toBe(1);
        return ctx;
      });

      expect(router.INSTANCE.INFLIGHT).toBe(0);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(router.INSTANCE.INFLIGHT).toBe(0);
    });
  });

  describe("Hooks", () => {
    it("calls onExecBefore hook", async () => {
      let hookCalled = false;

      router.hookOnExecBefore(async (ctx) => {
        hookCalled = true;
        return ctx;
      });

      router.on("GET /test").handle(async (ctx) => ctx);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });

    it("calls onExecAfter hook", async () => {
      let hookCalled = false;

      router.hookOnExecAfter(async (ctx) => {
        hookCalled = true;
        return ctx;
      });

      router.on("GET /test").handle(async (ctx) => ctx);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });

    it("calls onHandlerBefore hook", async () => {
      let hookCalled = false;

      router.hookOnHandlerBefore(async (ctx) => {
        hookCalled = true;
        return ctx;
      });

      router.on("GET /test").handle(async (ctx) => ctx);

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });
  });

  describe("Configuration", () => {
    describe("logLevel", () => {
      it("defaults to standard", () => {
        const defaultRouter = new CtxRouter<TDefaultCtx>();
        expect(defaultRouter.logLevel).toBe("standard");
      });

      it("accepts custom logLevel", () => {
        const verboseRouter = new CtxRouter<TDefaultCtx>({
          logLevel: "verbose",
        });
        expect(verboseRouter.logLevel).toBe("verbose");

        const minimalRouter = new CtxRouter<TDefaultCtx>({
          logLevel: "minimal",
        });
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
        const noStatsRouter = new CtxRouter<TDefaultCtx>({
          statsEnabled: false,
        });
        expect(noStatsRouter.statsEnabled).toBe(false);
      });

      it("executes handler successfully with stats disabled", async () => {
        const noStatsRouter = new CtxRouter<TDefaultCtx>({
          statsEnabled: false,
          logLevel: "none",
        });

        noStatsRouter.on("GET /test").handle(async (ctx) => {
          ctx.res.data = { success: true };
          return ctx;
        });

        const ctx = noStatsRouter.createCtx();
        setRoute(ctx, "GET", "/test");

        await noStatsRouter.exec(ctx);

        expect(ctx.res.code).toBe("OK");
        expect(ctx.res.data).toEqual({ success: true });
        expect(ctx.meta.ts.in).toBeGreaterThan(0);
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

  describe("Storage optimization", () => {
    it("stores exact routes in exactRoutes map", () => {
      router.on("GET /exact").handle(async (ctx) => ctx);

      expect(router.exactRoutes.size).toBeGreaterThan(0);
    });

    it("stores param routes in paramRoutes array", () => {
      router.on("GET /user/:id").handle(async (ctx) => ctx);

      expect(router.paramRoutes.length).toBeGreaterThan(0);
    });

    it("uses O(1) lookup for exact matches", async () => {
      // Register many routes
      for (let i = 0; i < 100; i++) {
        router.on(`GET /route${i}`).handle(async (ctx) => {
          ctx.res.data = { route: i };
          return ctx;
        });
      }

      const ctx = router.createCtx();
      setRoute(ctx, "GET", "/route50");

      const start = performance.now();
      await router.exec(ctx);
      const elapsed = performance.now() - start;

      expect(ctx.res.data).toEqual({ route: 50 });
      // Should be very fast (< 5ms) regardless of route count
      expect(elapsed).toBeLessThan(5);
    });
  });
});
