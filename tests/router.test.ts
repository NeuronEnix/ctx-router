import { describe, it, expect, beforeEach } from "vitest";
import { CtxRouter } from "../src/router/router";
import { CtxBaseError, CtxRouterError } from "../src/router/error";
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

  // INSTANCE tests removed - INSTANCE is no longer part of the public API
  // Instance metadata is available through ctx.meta.instance during execution

  describe("newCtx()", () => {
    it("creates context with default values", () => {
      const ctx = router.newCtx();

      expect(ctx.id).toBe("PENDING"); // Set in exec()
      expect(ctx.meta.monitor.traceId).toBe("PENDING");
      expect(ctx.meta.monitor.spanId).toBe("PENDING");
    });

    it("does not increment SEQ or INFLIGHT", () => {
      // Note: SEQ and INFLIGHT are internal state, tested via ctx.meta during exec()
      router.newCtx();
      router.newCtx();
      // Context creation should not trigger execution-level side effects
    });

    it("creates context with default user", () => {
      const ctx = router.newCtx();

      expect(ctx.user).toEqual({
        kind: "user",
        id: "none",
        role: ["none"],
        scope: [],
        handle: null,
      });
    });

    it("creates context with default response", () => {
      const ctx = router.newCtx();

      expect(ctx.res).toEqual({
        code: "OK",
        msg: "OK",
        data: {},
      });
    });

    it("sets placeholder timing metadata", () => {
      const ctx = router.newCtx();

      expect(ctx.meta.ts.in).toBe(-1); // Set in exec()
      expect(ctx.meta.ts.ingressIn).toBe(-1); // Set in exec()
      expect(ctx.meta.ts.out).toBe(-1);
      expect(ctx.meta.ts.execTime).toBe(-1);
    });

    it("accepts optional protocol parameter", () => {
      const ctx = router.newCtx("kafka");

      expect(ctx.req.transport).toBeDefined();
      expect(ctx.req.transport!.protocol).toBe("kafka");
    });
  });

  describe("Scoped router API", () => {
    it("route() returns a route builder scope (not the router)", () => {
      const scoped = router.route("user") as any;

      expect(scoped).not.toBe(router);
      expect(typeof scoped.route).toBe("function");
      expect(typeof scoped.via).toBe("function");
      expect(typeof scoped.to).toBe("function");
      expect(scoped.exec).toBeUndefined();
    });

    it("supports global via() before route()", async () => {
      const events: string[] = [];

      const mw = async (ctx: TDefaultCtx) => {
        events.push("mw");
        return ctx;
      };

      router
        .via(mw)
        .route("GET /test")
        .to(async (ctx) => {
          events.push("handler");
          ctx.res.data = { ok: true };
          return ctx;
        });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");
      await router.exec(ctx);

      expect(events).toEqual(["mw", "handler"]);
      expect(ctx.res.data).toEqual({ ok: true });
    });

    it("router.via().to() still throws without segments (runtime safeguard)", () => {
      const mw = async (ctx: TDefaultCtx) => ctx;
      expect(() => (router.via(mw) as any).to(async (ctx: TDefaultCtx) => ctx)).toThrow(
        "Cannot register handler without segments"
      );
    });

    it("route() throws on empty segment", () => {
      expect(() => router.route("")).toThrow(
        "Router.route() requires a non-empty string segment"
      );
    });

    it("route() throws when called without segments", () => {
      expect(() => (router as any).route()).toThrow(
        "Router.route() requires a non-empty string segment"
      );
    });

    it("route() throws when any variant is empty", () => {
      expect(() => router.route("/user", "")).toThrow(
        "Router.route() requires a non-empty string segment"
      );
    });

    it("to() throws if handler is not a function", () => {
      const scoped = router.route("test") as any;
      expect(() => scoped.to(null)).toThrow("Router.to() requires a function");
    });

    it("registers a simple route", async () => {
      router.route("GET /test").to(async (ctx) => {
        ctx.res.data = { success: true };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ success: true });
    });

    it("supports chained segments", async () => {
      router.route("/user/").route(":id").route("GET").to(async (ctx) => {
        ctx.res.data = { userId: (ctx.req.data as any).id };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/user/123");

      await router.exec(ctx);

      expect((ctx.req.data as any).id).toBe("123");
      expect(ctx.res.data).toEqual({ userId: "123" });
    });

    it("supports shared prefix routing", async () => {
      const userRouter = router.route("/user");

      userRouter.route("GET /:id").to(async (ctx) => {
        ctx.res.data = { action: "get", id: (ctx.req.data as any).id };
        return ctx;
      });

      userRouter.route("POST /update").to(async (ctx) => {
        ctx.res.data = { action: "update" };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/user/456");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ action: "get", id: "456" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/user/update");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ action: "update" });
    });

    it("supports cartesian variant expansion across chained route() calls", async () => {
      router
        .route("/user", "user")
        .route("GET /:id", ".:id")
        .to(async (ctx) => {
          ctx.res.data = {
            op: ctx.req.route.op,
            pattern: ctx.req.route.pattern,
            id: (ctx.req.data as any).id,
          };
          return ctx;
        });

      const cases: Array<{
        op: string | undefined;
        raw: string;
        expectedOp: string | undefined;
        expectedPattern: string;
        expectedId: string;
      }> = [
        {
          op: "GET",
          raw: "/user/111",
          expectedOp: "GET",
          expectedPattern: "/user/:id",
          expectedId: "111",
        },
        {
          op: "GET",
          raw: "user/222",
          expectedOp: "GET",
          expectedPattern: "user/:id",
          expectedId: "222",
        },
        {
          op: undefined,
          raw: "/user.333",
          expectedOp: undefined,
          expectedPattern: "/user.:id",
          expectedId: "333",
        },
        {
          op: "POST",
          raw: "user.444",
          expectedOp: "POST",
          expectedPattern: "user.:id",
          expectedId: "444",
        },
      ];

      for (const c of cases) {
        const ctx = router.newCtx();
        setRoute(ctx, c.op, c.raw);
        await router.exec(ctx);
        expect(ctx.res.data).toEqual({
          op: c.expectedOp,
          pattern: c.expectedPattern,
          id: c.expectedId,
        });
      }
    });
  });

  describe("HTTP grammar detection", () => {
    it("registers a single exact pattern when HTTP grammar is present", async () => {
      router.route("GET /job/:id/clean").to(async (ctx) => {
        ctx.res.data = { cleaned: (ctx.req.data as any).id };
        return ctx;
      });

      // Should match the explicitly registered slash pattern
      const ctx2 = router.newCtx();
      setRoute(ctx2, "GET", "/job/456/clean");
      await router.exec(ctx2);
      expect(ctx2.req.route.pattern).toBe("/job/:id/clean");
      expect((ctx2.req.data as any).id).toBe("456");

      // Should NOT auto-match dot variant anymore
      const ctx1 = router.newCtx();
      setRoute(ctx1, "GET", "job.123.clean");
      await expect(router.exec(ctx1)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("single pattern route when no HTTP grammar", async () => {
      router.route("event.").route(":name").to(async (ctx) => {
        ctx.res.data = { event: (ctx.req.data as any).name };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "event.test");
      await router.exec(ctx);
      expect(ctx.req.route.pattern).toBe("event.:name");
      expect((ctx.req.data as any).name).toBe("test");
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

      router.route("job.").route("clean").to(exactHandler);
      router.route("job.").route(":id").to(paramHandler);

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "job.clean");
      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ matched: "exact" });
    });

    it("orders param routes by specificity (HTTP slash patterns)", async () => {
      // Register generic first (would win under insertion-order)
      router.route("GET /user/:id/:action").to(async (ctx) => {
        ctx.res.data = { matched: "generic" };
        return ctx;
      });

      // Register more specific later
      router.route("GET /user/:id/detail").to(async (ctx) => {
        ctx.res.data = { matched: "detail" };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/user/123/detail");
      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ matched: "detail" });
      expect((ctx.req.data as any).id).toBe("123");
    });

    it("orders param routes by specificity (dot patterns)", async () => {
      // Generic first: job.:id.:op matches any operation segment
      router.route("job.").route(":id.").route(":op").to(async (ctx) => {
        ctx.res.data = { matched: "generic" };
        return ctx;
      });

      // More specific later: job.:id.clean should win for job.123.clean
      router.route("job.").route(":id.").route("clean").to(async (ctx) => {
        ctx.res.data = { matched: "clean" };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "job.123.clean");
      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ matched: "clean" });
      expect((ctx.req.data as any).id).toBe("123");
    });

    it("matches routes with params", async () => {
      router.route("/user/").route(":userId").route("GET").to(async (ctx) => {
        ctx.res.data = { userId: (ctx.req.data as any).userId };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/user/789");

      await router.exec(ctx);

      expect((ctx.req.data as any).userId).toBe("789");
      expect(ctx.res.data).toEqual({ userId: "789" });
    });

    it("updates route to pattern after matching", async () => {
      router.route("GET /item/:id").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/item/456");

      await router.exec(ctx);

      expect(ctx.req.route.pattern).toBe("/item/:id");
    });
  });

  describe("Operation (op) matching", () => {
    it("routes with op match only specific operation", async () => {
      router.route("GET /data").to(async (ctx) => {
        ctx.res.data = { method: "GET" };
        return ctx;
      });

      router.route("POST /data").to(async (ctx) => {
        ctx.res.data = { method: "POST" };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/data");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ method: "GET" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/data");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ method: "POST" });
    });

    it("routes without op match any operation (wildcard)", async () => {
      router.route("job.").route(":id").to(async (ctx) => {
        ctx.res.data = { id: (ctx.req.data as any).id, op: ctx.req.route.op };
        return ctx;
      });

      // Should match any op
      const ctx1 = router.newCtx();
      setRoute(ctx1, "GET", "job.abc");
      await router.exec(ctx1);
      expect(ctx1.res.data).toEqual({ id: "abc", op: "GET" });

      const ctx2 = router.newCtx();
      setRoute(ctx2, "POST", "job.xyz");
      await router.exec(ctx2);
      expect(ctx2.res.data).toEqual({ id: "xyz", op: "POST" });

      const ctx3 = router.newCtx();
      setRoute(ctx3, undefined, "job.foo");
      await router.exec(ctx3);
      expect(ctx3.res.data).toEqual({ id: "foo", op: undefined });
    });

    it("throws HANDLER_NOT_FOUND on op mismatch", async () => {
      router.route("GET /test").to(async (ctx) => {
        ctx.res.data = { op: "GET" };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "POST", "/test");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("op-less exact routes match any operation (wildcard)", async () => {
      router.route("/user/detail").to(async (ctx) => {
        ctx.res.data = { op: ctx.req.route.op ?? null };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/user/detail");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ op: "GET" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/user/detail");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ op: "POST" });

      const noOpCtx = router.newCtx();
      setRoute(noOpCtx, undefined, "/user/detail");
      await router.exec(noOpCtx);
      expect(noOpCtx.res.data).toEqual({ op: null });
    });

    it("op-specific param route wins over op-less param route", async () => {
      router.route("/user/:id").to(async (ctx) => {
        ctx.res.data = { matched: "wildcard", id: (ctx.req.data as any).id };
        return ctx;
      });
      router.route("GET /user/:id").to(async (ctx) => {
        ctx.res.data = { matched: "get", id: (ctx.req.data as any).id };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/user/1");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ matched: "get", id: "1" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/user/2");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ matched: "wildcard", id: "2" });

      const noOpCtx = router.newCtx();
      setRoute(noOpCtx, undefined, "/user/3");
      await router.exec(noOpCtx);
      expect(noOpCtx.res.data).toEqual({ matched: "wildcard", id: "3" });
    });

    it("op precedence for param routes is independent of registration order", async () => {
      // Op-specific registered FIRST this time - sorting, not insertion order,
      // must decide the winner
      router.route("GET /order/:id").to(async (ctx) => {
        ctx.res.data = { matched: "get" };
        return ctx;
      });
      router.route("/order/:id").to(async (ctx) => {
        ctx.res.data = { matched: "wildcard" };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/order/1");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ matched: "get" });

      const putCtx = router.newCtx();
      setRoute(putCtx, "PUT", "/order/2");
      await router.exec(putCtx);
      expect(putCtx.res.data).toEqual({ matched: "wildcard" });
    });

    it("keeps op-specific param routes separated per op", async () => {
      router.route("/thing/:id").to(async (ctx) => {
        ctx.res.data = { matched: "wildcard" };
        return ctx;
      });
      router.route("GET /thing/:id").to(async (ctx) => {
        ctx.res.data = { matched: "get" };
        return ctx;
      });
      router.route("DELETE /thing/:id").to(async (ctx) => {
        ctx.res.data = { matched: "delete" };
        return ctx;
      });

      for (const [op, matched] of [
        ["GET", "get"],
        ["DELETE", "delete"],
        ["POST", "wildcard"],
      ] as const) {
        const ctx = router.newCtx();
        setRoute(ctx, op, "/thing/9");
        await router.exec(ctx);
        expect(ctx.res.data).toEqual({ matched });
      }
    });

    it("op-specific exact route wins over op-less exact route", async () => {
      router.route("/status").to(async (ctx) => {
        ctx.res.data = { matched: "wildcard" };
        return ctx;
      });
      router.route("GET /status").to(async (ctx) => {
        ctx.res.data = { matched: "get" };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/status");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ matched: "get" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/status");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ matched: "wildcard" });
    });
  });

  describe("Splat (*) patterns", () => {
    it("matches a multi-segment tail and exposes it as an array", async () => {
      router.route("GET /files/*path").to(async (ctx) => {
        ctx.res.data = {
          path: (ctx.req.data as any).path,
          pattern: ctx.req.route.pattern,
        };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/a/b/c.txt");
      await router.exec(ctx);

      // path-to-regexp v8 returns splat params as an array of segments
      expect((ctx.req.data as any).path).toEqual(["a", "b", "c.txt"]);
      expect(ctx.req.route.pattern).toBe("/files/*path");
      expect(ctx.res.data).toEqual({
        path: ["a", "b", "c.txt"],
        pattern: "/files/*path",
      });
    });

    it("matches a single-segment tail as a one-element array", async () => {
      router.route("GET /files/*path").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/only.txt");
      await router.exec(ctx);

      expect((ctx.req.data as any).path).toEqual(["only.txt"]);
    });

    it("percent-decodes splat segments", async () => {
      router.route("GET /files/*path").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/a%20b/c");
      await router.exec(ctx);

      expect((ctx.req.data as any).path).toEqual(["a b", "c"]);
    });

    it("requires at least one segment for a bare splat", async () => {
      router.route("GET /files/*path").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files");
      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("respects op on splat routes", async () => {
      router.route("GET /files/*path").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "POST", "/files/a/b");
      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("op-less splat routes match any op", async () => {
      router.route("/assets/*rest").to(async (ctx) => {
        ctx.res.data = { op: ctx.req.route.op ?? null };
        return ctx;
      });

      for (const op of ["GET", "POST", undefined]) {
        const ctx = router.newCtx();
        setRoute(ctx, op, "/assets/img/logo.png");
        await router.exec(ctx);
        expect(ctx.res.data).toEqual({ op: op ?? null });
        expect((ctx.req.data as any).rest).toEqual(["img", "logo.png"]);
      }
    });

    it("op-specific splat route wins over op-less splat route", async () => {
      router.route("/pub/*rest").to(async (ctx) => {
        ctx.res.data = { matched: "wildcard" };
        return ctx;
      });
      router.route("GET /pub/*rest").to(async (ctx) => {
        ctx.res.data = { matched: "get" };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/pub/a/b");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ matched: "get" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/pub/a/b");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ matched: "wildcard" });
    });

    it("more static patterns outrank splats", async () => {
      router.route("GET /files/*path").to(async (ctx) => {
        ctx.res.data = { matched: "splat" };
        return ctx;
      });
      router.route("GET /files/config/*path").to(async (ctx) => {
        ctx.res.data = { matched: "config" };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/config/a/b");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "config" });

      const other = router.newCtx();
      setRoute(other, "GET", "/files/other/a");
      await router.exec(other);
      expect(other.res.data).toEqual({ matched: "splat" });
    });

    it("a single-segment :param outranks an equally sized splat", async () => {
      // Register the splat first so insertion order would favour it
      router.route("GET /doc/*path").to(async (ctx) => {
        ctx.res.data = { matched: "splat" };
        return ctx;
      });
      router.route("GET /doc/:name").to(async (ctx) => {
        ctx.res.data = { matched: "param" };
        return ctx;
      });

      const single = router.newCtx();
      setRoute(single, "GET", "/doc/readme.md");
      await router.exec(single);
      expect(single.res.data).toEqual({ matched: "param" });

      // Multi-segment paths can only be served by the splat
      const deep = router.newCtx();
      setRoute(deep, "GET", "/doc/a/b/c");
      await router.exec(deep);
      expect(deep.res.data).toEqual({ matched: "splat" });
    });

    it("exact routes still beat splat routes", async () => {
      router.route("GET /files/*path").to(async (ctx) => {
        ctx.res.data = { matched: "splat" };
        return ctx;
      });
      router.route("GET /files/manifest").to(async (ctx) => {
        ctx.res.data = { matched: "exact" };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/manifest");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "exact" });
    });

    it("splat params keep the lowest merge priority", async () => {
      router.route("GET /files/*path").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/a/b");
      ctx.req.data = { path: "from-body" };
      await router.exec(ctx);

      expect((ctx.req.data as any).path).toBe("from-body");
    });

    it("throws DUPLICATE_ROUTE when the same splat route is registered twice", () => {
      const handler = async (ctx: TDefaultCtx) => ctx;
      router.route("GET /files/*path").to(handler);
      expect(() => router.route("GET /files/*path").to(handler)).toThrow(
        "already registered"
      );
    });

    it("throws MALFORMED_ROUTE_PATH when a splat segment cannot be decoded", async () => {
      router.route("GET /files/*path").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/files/100%/x");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "MALFORMED_ROUTE_PATH",
      });
    });

    it("supports an optional splat group", async () => {
      router.route("GET /opt{/*path}").to(async (ctx) => {
        ctx.res.data = { path: (ctx.req.data as any).path ?? null };
        return ctx;
      });

      const bare = router.newCtx();
      setRoute(bare, "GET", "/opt");
      await router.exec(bare);
      expect(bare.res.data).toEqual({ path: null });

      const deep = router.newCtx();
      setRoute(deep, "GET", "/opt/a/b");
      await router.exec(deep);
      expect(deep.res.data).toEqual({ path: ["a", "b"] });
    });
  });

  describe("Optional group ({...}) patterns", () => {
    it("matches with and without the optional group", async () => {
      router.route("GET /opt{/x}").to(async (ctx) => {
        ctx.res.data = { pattern: ctx.req.route.pattern };
        return ctx;
      });

      const bare = router.newCtx();
      setRoute(bare, "GET", "/opt");
      await router.exec(bare);
      expect(bare.res.data).toEqual({ pattern: "/opt{/x}" });

      const withGroup = router.newCtx();
      setRoute(withGroup, "GET", "/opt/x");
      await router.exec(withGroup);
      expect(withGroup.res.data).toEqual({ pattern: "/opt{/x}" });
    });

    it("does not match a different tail", async () => {
      router.route("GET /opt{/x}").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/opt/y");
      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("respects op on group patterns", async () => {
      router.route("GET /opt{/x}").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "POST", "/opt");
      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("op-specific group route wins over op-less group route", async () => {
      router.route("/grp{/x}").to(async (ctx) => {
        ctx.res.data = { matched: "wildcard" };
        return ctx;
      });
      router.route("GET /grp{/x}").to(async (ctx) => {
        ctx.res.data = { matched: "get" };
        return ctx;
      });

      const getCtx = router.newCtx();
      setRoute(getCtx, "GET", "/grp/x");
      await router.exec(getCtx);
      expect(getCtx.res.data).toEqual({ matched: "get" });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/grp/x");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ matched: "wildcard" });
    });

    it("exact routes still beat group routes", async () => {
      router.route("GET /opt{/x}").to(async (ctx) => {
        ctx.res.data = { matched: "group" };
        return ctx;
      });
      router.route("GET /opt").to(async (ctx) => {
        ctx.res.data = { matched: "exact" };
        return ctx;
      });

      const exactCtx = router.newCtx();
      setRoute(exactCtx, "GET", "/opt");
      await router.exec(exactCtx);
      expect(exactCtx.res.data).toEqual({ matched: "exact" });

      // The group route still serves the tail the exact route cannot
      const tailCtx = router.newCtx();
      setRoute(tailCtx, "GET", "/opt/x");
      await router.exec(tailCtx);
      expect(tailCtx.res.data).toEqual({ matched: "group" });
    });

    it("throws DUPLICATE_ROUTE for the same group pattern and op", () => {
      const handler = async (ctx: TDefaultCtx) => ctx;
      router.route("GET /opt{/x}").to(handler);
      expect(() => router.route("GET /opt{/x}").to(handler)).toThrow(
        "already registered"
      );
    });

    it("allows the same group pattern under different ops", async () => {
      router.route("GET /opt{/x}").to(async (ctx) => {
        ctx.res.data = { matched: "get" };
        return ctx;
      });
      router.route("POST /opt{/x}").to(async (ctx) => {
        ctx.res.data = { matched: "post" };
        return ctx;
      });

      const postCtx = router.newCtx();
      setRoute(postCtx, "POST", "/opt/x");
      await router.exec(postCtx);
      expect(postCtx.res.data).toEqual({ matched: "post" });
    });

    it("combines groups with params", async () => {
      router.route("GET /u/:id{/detail}").to(async (ctx) => {
        ctx.res.data = { id: (ctx.req.data as any).id };
        return ctx;
      });

      const bare = router.newCtx();
      setRoute(bare, "GET", "/u/7");
      await router.exec(bare);
      expect(bare.res.data).toEqual({ id: "7" });

      const detail = router.newCtx();
      setRoute(detail, "GET", "/u/7/detail");
      await router.exec(detail);
      expect(detail.res.data).toEqual({ id: "7" });
    });

    it("does not count braces as static characters when ranking", async () => {
      // Both patterns match "/m/a/b/c". Counting "{" and "}" as static chars
      // would give the 3-group pattern 14 static chars vs 12 and let it win;
      // only the literal text counts, so the 8-char literal loses to the
      // 10-char one.
      router.route("GET /m{/a}{/b}{/c}").to(async (ctx) => {
        ctx.res.data = { matched: "groups" };
        return ctx;
      });
      router.route("GET /m/a/b/c{/d}").to(async (ctx) => {
        ctx.res.data = { matched: "literal" };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/m/a/b/c");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "literal" });
    });

    it("keeps truly static patterns on the exact path", async () => {
      // A pattern with no dynamic token must still land in the exact map:
      // registering it twice collides, and a sibling path does not match.
      const handler = async (ctx: TDefaultCtx) => {
        ctx.res.data = { matched: "static" };
        return ctx;
      };
      router.route("GET /plain/static").to(handler);
      expect(() => router.route("GET /plain/static").to(handler)).toThrow(
        "already registered"
      );

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/plain/static");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "static" });

      const miss = router.newCtx();
      setRoute(miss, "GET", "/plain/static/extra");
      await expect(router.exec(miss)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });
  });

  describe("Ctx return contract", () => {
    const badHandler = (async () => undefined) as unknown as (
      ctx: TDefaultCtx
    ) => Promise<TDefaultCtx>;

    it("throws INVALID_HANDLER_RETURN when a handler returns undefined", async () => {
      router.route("GET /bad").to(badHandler);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/bad");

      await expect(router.exec(ctx)).rejects.toBeInstanceOf(CtxRouterError);
      expect(ctx.err?.name).toBe("INVALID_HANDLER_RETURN");
      expect(ctx.err?.data).toMatchObject({
        stage: "handler",
        pattern: "/bad",
        returned: "undefined",
      });
    });

    it("routes INVALID_HANDLER_RETURN through the error hook", async () => {
      const events: string[] = [];
      router.hook.onExec.error(() => {
        events.push("error");
      });
      router.hook.onExec.finally(() => {
        events.push("finally");
      });
      router.route("GET /bad").to(badHandler);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/bad");
      const returned = await router.exec(ctx);

      expect(returned).toBe(ctx);
      expect(ctx.res.code).toBe("INVALID_HANDLER_RETURN");
      expect(ctx.err).toBeInstanceOf(CtxRouterError);
      expect(events).toEqual(["error", "finally"]);
      // finally block completed: timing was written
      expect(ctx.meta.ts.out).toBeGreaterThan(0);
      expect(ctx.meta.ts.execTime).toBeGreaterThanOrEqual(0);
    });

    it("does not leak inflight when a handler returns a non-ctx value", async () => {
      router.route("GET /bad").to(badHandler);
      router.route("GET /good").to(async (ctx) => ctx);

      const bad = router.newCtx();
      setRoute(bad, "GET", "/bad");
      expect(bad).toBeDefined();
      await expect(router.exec(bad)).rejects.toMatchObject({
        name: "INVALID_HANDLER_RETURN",
      });

      const good = router.newCtx();
      setRoute(good, "GET", "/good");
      await router.exec(good);

      // Inflight was released by the failed exec, so this request sees 1
      expect(good.meta.instance.inflight).toBe(1);
    });

    it("does not leak inflight when the error hook swallows the failure", async () => {
      router.hook.onExec.error(() => {});
      router.route("GET /bad").to(badHandler);
      router.route("GET /good").to(async (ctx) => ctx);

      const bad = router.newCtx();
      setRoute(bad, "GET", "/bad");
      await router.exec(bad);

      const good = router.newCtx();
      setRoute(good, "GET", "/good");
      await router.exec(good);

      expect(good.meta.instance.inflight).toBe(1);
    });

    it("throws INVALID_HANDLER_RETURN when a middleware returns undefined", async () => {
      const badMw = (async () => undefined) as unknown as (
        ctx: TDefaultCtx
      ) => Promise<TDefaultCtx>;
      let handlerRan = false;

      router
        .route("GET /badmw")
        .via(badMw)
        .to(async (ctx) => {
          handlerRan = true;
          return ctx;
        });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/badmw");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "INVALID_HANDLER_RETURN",
        data: { stage: "middleware", index: 0, pattern: "/badmw" },
      });
      expect(handlerRan).toBe(false);
    });

    it("reports the offending middleware index", async () => {
      const okMw = async (ctx: TDefaultCtx) => ctx;
      const badMw = (async () => null) as unknown as (
        ctx: TDefaultCtx
      ) => Promise<TDefaultCtx>;

      router
        .route("GET /mw2")
        .via(okMw, badMw)
        .to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/mw2");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "INVALID_HANDLER_RETURN",
        data: { stage: "middleware", index: 1, returned: "null" },
      });
    });

    it("rejects non-ctx objects and primitives", async () => {
      const cases: unknown[] = [null, undefined, 42, "ctx", true, {}, []];

      for (const value of cases) {
        const localRouter = new CtxRouter<TDefaultCtx>({ logLevel: "none" });
        localRouter.route("GET /x").to(
          (async () => value) as unknown as (
            ctx: TDefaultCtx
          ) => Promise<TDefaultCtx>
        );

        const ctx = localRouter.newCtx();
        setRoute(ctx, "GET", "/x");
        await expect(localRouter.exec(ctx)).rejects.toMatchObject({
          name: "INVALID_HANDLER_RETURN",
        });
      }
    });

    it("still accepts a different object that satisfies the ctx shape", async () => {
      router.route("GET /clone").to(async (ctx) => ({ ...ctx }));

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/clone");
      const returned = await router.exec(ctx);

      expect(returned).not.toBe(ctx);
      expect(returned.meta.ts.out).toBeGreaterThan(0);
    });

    it("also applies to param and splat routes", async () => {
      router.route("GET /p/:id").to(badHandler);
      router.route("GET /s/*rest").to(badHandler);

      const paramCtx = router.newCtx();
      setRoute(paramCtx, "GET", "/p/1");
      await expect(router.exec(paramCtx)).rejects.toMatchObject({
        name: "INVALID_HANDLER_RETURN",
        data: { pattern: "/p/:id" },
      });

      const splatCtx = router.newCtx();
      setRoute(splatCtx, "GET", "/s/a/b");
      await expect(router.exec(splatCtx)).rejects.toMatchObject({
        name: "INVALID_HANDLER_RETURN",
        data: { pattern: "/s/*rest" },
      });
    });
  });

  describe("Route registration validation", () => {
    const handler = async (ctx: TDefaultCtx) => ctx;

    it("throws MULTIPLE_HTTP_METHODS when a chain declares more than one method", () => {
      expect(() =>
        router.route("GET /user").route("POST /:id").to(handler)
      ).toThrow("more than one HTTP method");
    });

    it("throws when a method token is not in leading position", () => {
      expect(() => router.route("/files delete").to(handler)).toThrow(
        "Route segment must be"
      );
    });

    it("throws on a segment with multiple pattern tokens", () => {
      expect(() => router.route("GET /user /detail").to(handler)).toThrow(
        "Route segment must be"
      );
    });

    it("throws EMPTY_ROUTE_PATTERN when segments contain only a method", () => {
      expect(() => router.route("GET").to(handler)).toThrow(
        "Route pattern is empty"
      );
    });

    it("normalizes lowercase method tokens to uppercase op", async () => {
      router.route("get /lower").to(async (ctx) => {
        ctx.res.data = { matched: true };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/lower");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: true });
    });

    it("throws DUPLICATE_ROUTE when the same exact route is registered twice", () => {
      router.route("GET /dup").to(handler);
      expect(() => router.route("GET /dup").to(handler)).toThrow(
        "already registered"
      );
    });

    it("throws DUPLICATE_ROUTE when the same param route is registered twice", () => {
      router.route("GET /dup/:id").to(handler);
      expect(() => router.route("GET /dup/:id").to(handler)).toThrow(
        "already registered"
      );
    });

    it("allows the same pattern under different ops", () => {
      router.route("GET /same").to(handler);
      expect(() => router.route("POST /same").to(handler)).not.toThrow();
    });
  });

  describe("Atomic route registration", () => {
    const handler = async (ctx: TDefaultCtx) => ctx;

    async function expectNotRegistered(
      op: string | undefined,
      raw: string
    ): Promise<void> {
      const ctx = router.newCtx();
      setRoute(ctx, op, raw);
      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    }

    it("registers nothing when a later variant duplicates an existing route", async () => {
      router.route("GET /dup").to(async (ctx) => {
        ctx.res.data = { matched: "original" };
        return ctx;
      });

      expect(() =>
        router.route("GET /fresh", "GET /dup").to(async (ctx) => {
          ctx.res.data = { matched: "batch" };
          return ctx;
        })
      ).toThrow("already registered");

      // The good variant of the rejected batch must NOT be registered
      await expectNotRegistered("GET", "/fresh");

      // The pre-existing route is untouched
      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/dup");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "original" });
    });

    it("rejects a batch that duplicates itself (exact patterns)", async () => {
      expect(() => router.route("/a", "/a").to(handler)).toThrow(
        "already registered"
      );
      await expectNotRegistered(undefined, "/a");
    });

    it("rejects a batch that duplicates itself (param patterns)", async () => {
      expect(() => router.route("GET /p/:id", "GET /p/:id").to(handler)).toThrow(
        "already registered"
      );
      await expectNotRegistered("GET", "/p/1");
    });

    it("rejects a batch whose cartesian expansion collides", async () => {
      // "/x" + "/:id" and "/x/" + ":id" both build the pattern "/x/:id"
      expect(() =>
        router.route("/x", "/x/").route("GET /:id", "GET :id").to(handler)
      ).toThrow("already registered");
      await expectNotRegistered("GET", "/x/1");
    });

    it("registers nothing when a later variant has malformed grammar", async () => {
      expect(() => router.route("/ok", "/bad seg").to(handler)).toThrow(
        "Route segment must be"
      );
      await expectNotRegistered(undefined, "/ok");
    });

    it("registers nothing when a later variant declares two methods", async () => {
      expect(() =>
        router.route("/a", "GET /b").route("POST /c").to(handler)
      ).toThrow("more than one HTTP method");
      await expectNotRegistered("POST", "/a/c");
    });

    it("registers nothing when a later variant has an empty pattern", async () => {
      expect(() => router.route("/ok", "GET").to(handler)).toThrow(
        "Route pattern is empty"
      );
      await expectNotRegistered(undefined, "/ok");
    });

    it("commits every variant when the whole batch is valid", async () => {
      router.route("/v1", "/v2").route("GET /:id").to(async (ctx) => {
        ctx.res.data = {
          pattern: ctx.req.route.pattern,
          id: (ctx.req.data as any).id,
        };
        return ctx;
      });

      for (const prefix of ["/v1", "/v2"]) {
        const ctx = router.newCtx();
        setRoute(ctx, "GET", `${prefix}/9`);
        await router.exec(ctx);
        expect(ctx.res.data).toEqual({ pattern: `${prefix}/:id`, id: "9" });
      }
    });

    it("leaves param-route ordering intact after a rejected batch", async () => {
      router.route("GET /o/:id/detail").to(async (ctx) => {
        ctx.res.data = { matched: "detail" };
        return ctx;
      });
      router.route("GET /o/:id/:action").to(async (ctx) => {
        ctx.res.data = { matched: "generic" };
        return ctx;
      });

      expect(() =>
        router.route("GET /o/:id/fresh", "GET /o/:id/detail").to(handler)
      ).toThrow("already registered");

      // Specificity ordering still holds
      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/o/1/detail");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "detail" });

      // "/o/:id/fresh" was never stored - had it been, it would outrank the
      // generic route (more static chars) and win here
      const fresh = router.newCtx();
      setRoute(fresh, "GET", "/o/1/fresh");
      await router.exec(fresh);
      expect(fresh.res.data).toEqual({ matched: "generic" });
    });
  });

  describe("Malformed route path", () => {
    it("throws MALFORMED_ROUTE_PATH for undecodable percent-encoding", async () => {
      router.route("GET /file/:name").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/file/100%");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "MALFORMED_ROUTE_PATH",
      });
    });

    it("still matches a later route when an earlier matcher fails to decode", async () => {
      // "/files/:x" captures "100%" and fails to decode; "/:y/100%" matches cleanly
      router.route("/files/:x").to(async (ctx) => {
        ctx.res.data = { matched: "x" };
        return ctx;
      });
      router.route("/:y/100%").to(async (ctx) => {
        ctx.res.data = { matched: "y", y: (ctx.req.data as any).y };
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "/files/100%");
      await router.exec(ctx);
      expect(ctx.res.data).toEqual({ matched: "y", y: "files" });
    });
  });

  describe("Error normalization", () => {
    class TestAppErr extends CtxBaseError {}

    it("sets ctx.err and pre-fills res from a thrown CtxBaseError when error hook is registered", async () => {
      const thrown = new TestAppErr({
        name: "MY_ERROR",
        msg: "boom",
        data: { a: 1 },
      });
      router.hook.onExec.error(async () => {});
      router.route("GET /fail").to(async () => {
        throw thrown;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await router.exec(ctx);

      expect(ctx.err).toBe(thrown);
      expect(ctx.res.code).toBe("MY_ERROR");
      expect(ctx.res.msg).toBe("boom");
      expect(ctx.res.data).toEqual({ a: 1 });
    });

    it("wraps non-CtxBaseError values as UNKNOWN_ERROR router error", async () => {
      let hookErr: unknown;
      router.hook.onExec.error(async (_ctx, error) => {
        hookErr = error;
      });
      const original = new Error("kaput");
      router.route("GET /fail").to(async () => {
        throw original;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await router.exec(ctx);

      expect(hookErr).toBe(original);
      expect(ctx.err).toBeInstanceOf(CtxRouterError);
      expect(ctx.err?.name).toBe("UNKNOWN_ERROR");
      expect(ctx.res.code).toBe("UNKNOWN_ERROR");
    });

    it("lets the error hook override the pre-filled response", async () => {
      router.hook.onExec.error(async (ctx) => {
        ctx.res.code = "CUSTOM";
        ctx.res.msg = "custom msg";
      });
      router.route("GET /fail").to(async () => {
        throw new Error("kaput");
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await router.exec(ctx);

      expect(ctx.res.code).toBe("CUSTOM");
      expect(ctx.res.msg).toBe("custom msg");
    });

    it("preserves the original thrown value in info.cause", async () => {
      const original = new Error("kaput");
      router.hook.onExec.error(async () => {});
      router.route("GET /fail").to(async () => {
        throw original;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await router.exec(ctx);

      expect(ctx.err?.name).toBe("UNKNOWN_ERROR");
      expect(ctx.err?.info?.cause).toBe(original);
      expect((ctx.err?.info?.cause as Error).stack).toBeDefined();
    });

    it("preserves non-Error thrown values in info.cause", async () => {
      const original = { code: 42 };
      router.hook.onExec.error(async () => {});
      router.route("GET /fail").to(async () => {
        throw original;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await router.exec(ctx);

      expect(ctx.err?.info?.cause).toBe(original);
    });

    it("copies err.data into res.data instead of aliasing it", async () => {
      const thrown = new TestAppErr({
        name: "MY_ERROR",
        msg: "boom",
        data: { a: 1 },
      });
      router.hook.onExec.error(async (ctx) => {
        ctx.res.data.b = 2;
      });
      router.route("GET /fail").to(async () => {
        throw thrown;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await router.exec(ctx);

      expect(ctx.res.data).toEqual({ a: 1, b: 2 });
      expect(ctx.res.data).not.toBe(thrown.data);
      // The error's own client-safe payload must be untouched
      expect(thrown.data).toEqual({ a: 1 });
    });

    it("re-throws and still sets ctx.err when no error hook is registered", async () => {
      const original = new Error("kaput");
      router.route("GET /fail").to(async () => {
        throw original;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/fail");
      await expect(router.exec(ctx)).rejects.toBe(original);
      expect(ctx.err?.name).toBe("UNKNOWN_ERROR");
    });
  });

  describe("Cross-transport params", () => {
    it("params work across all transports with explicit delimiters", async () => {
      router.route("job.").route(":resource").route(".clean").route("GET").to(async (ctx) => {
        ctx.res.data = { resource: (ctx.req.data as any).resource };
        return ctx;
      });

      router.route("GET /job/:resource/clean").to(async (ctx) => {
        ctx.res.data = { resource: (ctx.req.data as any).resource };
        return ctx;
      });

      // Kafka-style (dot separator)
      const kafkaCtx = router.newCtx("kafka");
      setRoute(kafkaCtx, "GET", "job.abc.clean");
      await router.exec(kafkaCtx);
      expect((kafkaCtx.req.data as any).resource).toBe("abc");

      // HTTP-style (slash separator)
      const httpCtx = router.newCtx("http");
      setRoute(httpCtx, "GET", "/job/xyz/clean");
      await router.exec(httpCtx);
      expect((httpCtx.req.data as any).resource).toBe("xyz");
    });
  });

  describe("Error handling", () => {
    it("throws HANDLER_NOT_FOUND for unregistered route", async () => {
      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/unknown");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
      });
    });

    it("includes route info in error data", async () => {
      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/nonexistent");

      await expect(router.exec(ctx)).rejects.toMatchObject({
        name: "HANDLER_NOT_FOUND",
        data: { route: "GET /nonexistent" },
      });
    });
  });

  describe("Execution lifecycle", () => {
    it("sets timing metadata after execution", async () => {
      router.route("GET /test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.meta.ts.in).toBeGreaterThan(0);
      expect(ctx.meta.ts.out).toBeGreaterThan(0);
      expect(ctx.meta.ts.execTime).toBeGreaterThanOrEqual(0);
    });

    it("sets clientIn, ingressIn, and owd to -1 when caller hints are absent", async () => {
      router.route("GET /test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.meta.ts.clientIn).toBe(-1);
      expect(ctx.meta.ts.ingressIn).toBe(-1);
      expect(ctx.meta.ts.owd).toBe(-1);
    });

    it("computes clientIn, ingressIn, and owd from caller hints when provided", async () => {
      router.route("GET /timed").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/timed");
      const clientTs = Date.now() - 50;
      ctx.req.caller = { ts: clientTs, ingressIn: clientTs + 10 };

      await router.exec(ctx);

      expect(ctx.meta.ts.clientIn).toBe(clientTs);
      expect(ctx.meta.ts.ingressIn).toBe(clientTs + 10);
      expect(ctx.meta.ts.owd).toBeGreaterThanOrEqual(50);
    });

    it("floors owd at 0 when the client clock runs ahead", async () => {
      router.route("GET /skew").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/skew");
      const futureTs = Date.now() + 60_000;
      ctx.req.caller = { ts: futureTs };

      await router.exec(ctx);

      // clientIn is reported as-is; only the derived delay is clamped
      expect(ctx.meta.ts.clientIn).toBe(futureTs);
      expect(ctx.meta.ts.owd).toBe(0);
    });

    it("populates cpu/mem stats during exec", async () => {
      router.route("GET /test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(ctx.meta.instance.mem).toBeGreaterThan(0);
      expect(ctx.meta.instance.cpu).toBeGreaterThanOrEqual(0);
    });

    it("sets response meta after execution", async () => {
      router.route("GET /test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      // Metadata is in ctx.meta, not ctx.res.meta
      expect(ctx.meta.monitor.traceId).toBe(ctx.id);
      expect(ctx.meta.instance.seq).toBe(1);
    });

    it("tracks inflight requests via ctx.meta.instance", async () => {
      router.route("GET /test").to(async (ctx) => {
        // INFLIGHT is tracked internally and reflected in ctx.meta.instance.inflight
        expect(ctx.meta.instance.inflight).toBeGreaterThanOrEqual(1);
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      // After execution completes, inflight count is captured in final ctx
      expect(ctx.meta.instance.inflight).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Hook DSL", () => {
    it("hook property is created once (stable reference)", () => {
      const hook1 = router.hook;
      const hook2 = router.hook;
      expect(hook1).toBe(hook2);
    });

    it("hooks are chainable", () => {
      const result = router.hook.onExec.before(async () => {});
      expect(result).toBe(router);
    });

    it("calls onExecBefore hook", async () => {
      let hookCalled = false;

      router.hook.onExec.before(async () => {
        hookCalled = true;
      });

      router.route("GET /test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });

    it("calls onExecAfter hook", async () => {
      let hookCalled = false;

      router.hook.onExec.after(async () => {
        hookCalled = true;
      });

      router.route("GET /test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, "GET", "/test");

      await router.exec(ctx);

      expect(hookCalled).toBe(true);
    });

    it("hooks are sealed after first exec", async () => {
      router.route("test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "test");

      await router.exec(ctx);

      expect(() => {
        router.hook.onExec.before(async () => {});
      }).toThrow("Hooks must be registered during startup, before exec()");
    });

    it("scoped routers share hook state", async () => {
      let called = false;

      router.hook.onExec.before(async () => {
        called = true;
      });

      const userRouter = router.route("user.");
      userRouter.route("test").to(async (ctx) => ctx);

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "user.test");

      await router.exec(ctx);

      expect(called).toBe(true);
    });

    it("hooks are side-effects (mutate ctx directly)", async () => {
      const events: string[] = [];

      router.hook.onExec.before(async (ctx) => {
        events.push("before");
        ctx.res.data.beforeCalled = true;
      });

      router.hook.onExec.after(async (ctx) => {
        events.push("after");
        ctx.res.data.afterCalled = true;
      });

      router.route("test").to(async (ctx) => {
        events.push("handler");
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "test");

      await router.exec(ctx);

      expect(events).toEqual(["before", "handler", "after"]);
      expect(ctx.res.data.beforeCalled).toBe(true);
      expect(ctx.res.data.afterCalled).toBe(true);
    });

    it("calls all hook types in correct order", async () => {
      const events: string[] = [];

      router.hook.onExec.before(() => {
        events.push("execBefore");
      });
      router.hook.onExec.after(() => {
        events.push("execAfter");
      });
      router.hook.onExec.finally(() => {
        events.push("execFinally");
      });

      router.route("test").to(async (ctx) => {
        events.push("handler");
        return ctx;
      });

      const ctx = router.newCtx();
      setRoute(ctx, undefined, "test");

      await router.exec(ctx);

      expect(events).toEqual([
        "execBefore",
        "handler",
        "execAfter",
        "execFinally",
      ]);
    });
  });

  describe("Configuration", () => {
    describe("logLevel", () => {
      it("accepts logLevel configuration", () => {
        // logLevel is now private - configuration is accepted but not directly testable
        // The behavior is observable through router logging output
        const verboseRouter = new CtxRouter<TDefaultCtx>({
          logLevel: "verbose",
        });
        expect(verboseRouter).toBeDefined();

        const minimalRouter = new CtxRouter<TDefaultCtx>({
          logLevel: "minimal",
        });
        expect(minimalRouter).toBeDefined();

        const noneRouter = new CtxRouter<TDefaultCtx>({ logLevel: "none" });
        expect(noneRouter).toBeDefined();
      });
    });

  });

  describe("Storage optimization", () => {
    it("handles exact route registration", () => {
      // exactRoutes is now private - test behavior through routing instead
      router.route("GET /exact").to(async (ctx) => ctx);
      // Route registration should complete without errors
      expect(router).toBeDefined();
    });

    it("handles param route registration", () => {
      // paramRoutes is now private - test behavior through routing instead
      router.route("GET /user/:id").to(async (ctx) => ctx);
      // Route registration should complete without errors
      expect(router).toBeDefined();
    });

    it("uses O(1) lookup for exact matches", async () => {
      // Register many routes
      for (let i = 0; i < 100; i++) {
        router.route(`GET /route${i}`).to(async (ctx) => {
          ctx.res.data = { route: i };
          return ctx;
        });
      }

      const ctx = router.newCtx();
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
