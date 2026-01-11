import { describe, it, expect, beforeEach } from "vitest";
import { Request } from "express";
import { enrichFromExpress } from "../../src/adapter/express.v5";
import { CtxRouter } from "../../src/router";
import { TDefaultCtx } from "../../src/core";

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    url: "/test",
    headers: {},
    body: {},
    query: {},
    params: {},
    ip: undefined,
    ips: [],
    ...overrides,
  } as Request;
}

describe("enrichFromExpress", () => {
  let router: CtxRouter<TDefaultCtx>;
  let ctx: TDefaultCtx;

  beforeEach(() => {
    router = new CtxRouter<TDefaultCtx>({ logLevel: "none" });
    ctx = router.begin();
  });

  describe("route extraction", () => {
    it("sets route and routeValue from method and path", () => {
      const req = createMockRequest({
        method: "POST",
        url: "/api/users",
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.routeValue).toBe("POST /api/users");
      expect(ctx.req.route).toBe("POST /api/users");
    });

    it("strips query params from path", () => {
      const req = createMockRequest({
        method: "GET",
        url: "/search?q=test&page=1",
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.routeValue).toBe("GET /search");
    });
  });

  describe("data extraction", () => {
    it("merges body, query, and params into data", () => {
      const req = createMockRequest({
        body: { name: "John" },
        query: { sort: "asc" },
        params: { id: "123" },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.data).toEqual({
        name: "John",
        sort: "asc",
        id: "123",
      });
    });

    it("params override query which overrides body", () => {
      const req = createMockRequest({
        body: { field: "body" },
        query: { field: "query" },
        params: { field: "params" },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.data.field).toBe("params");
    });
  });

  describe("auth extraction", () => {
    it("extracts bearer token from Authorization header", () => {
      const req = createMockRequest({
        headers: {
          authorization: "Bearer abc123token",
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.auth?.bearerToken).toBe("abc123token");
    });

    it("extracts api key from x-api-key header", () => {
      const req = createMockRequest({
        headers: {
          "x-api-key": "api-key-123",
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.auth?.apiKey).toBe("api-key-123");
    });

    it("extracts refresh token from x-ctx-refresh-token header", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-refresh-token": "refresh-token-456",
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.auth?.refreshToken).toBe("refresh-token-456");
    });

    it("does not set auth when no auth headers present", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req);

      expect(ctx.req.auth).toBeUndefined();
    });
  });

  describe("transport extraction", () => {
    it("sets protocol to http", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req);

      expect(ctx.req.transport.protocol).toBe("http");
    });

    it("sets request method and path", () => {
      const req = createMockRequest({
        method: "PUT",
        url: "/api/item/123",
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.transport.request?.method).toBe("PUT");
      expect(ctx.req.transport.request?.path).toBe("/api/item/123");
    });

    it("sets network info when ip is present", () => {
      const req = createMockRequest({
        ip: "192.168.1.1",
        ips: ["10.0.0.1", "192.168.1.1"],
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.transport.network?.originIp).toBe("192.168.1.1");
      expect(ctx.req.transport.network?.hops).toEqual([
        "10.0.0.1",
        "192.168.1.1",
      ]);
    });

    it("sets transport meta from headers", () => {
      const req = createMockRequest({
        headers: {
          "user-agent": "Mozilla/5.0",
          "content-type": "application/json",
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.transport.meta?.["user-agent"]).toBe("Mozilla/5.0");
      expect(ctx.req.transport.meta?.["content-type"]).toBe("application/json");
    });

    it("stores raw request reference", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req);

      expect(ctx.req.transport.raw).toBe(req);
    });
  });

  describe("client headers extraction", () => {
    it("extracts device info from headers", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-device-name": "iPhone 15",
          "x-ctx-device-id": "device-abc",
          "x-ctx-os": "iOS 17",
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.client?.deviceName).toBe("iPhone 15");
      expect(ctx.req.client?.deviceId).toBe("device-abc");
      expect(ctx.req.client?.os).toBe("iOS 17");
    });

    it("extracts app version info from headers", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-app-version": "2.0.0",
          "x-ctx-api-version": "v2",
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.req.client?.appVersion).toBe("2.0.0");
      expect(ctx.req.client?.apiVersion).toBe("v2");
    });
  });

  describe("timestamp handling", () => {
    it("uses x-ctx-ts header for clientIn timestamp", () => {
      const clientTimestamp = new Date("2024-01-01T12:00:00Z").toISOString();
      const req = createMockRequest({
        headers: {
          "x-ctx-ts": clientTimestamp,
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.meta.ts.clientIn).toBe(
        new Date("2024-01-01T12:00:00Z").getTime()
      );
    });

    it("falls back to server timestamp when x-ctx-ts is missing", () => {
      const serverIn = ctx.meta.ts.in;
      const req = createMockRequest();

      enrichFromExpress(ctx, req);

      expect(ctx.meta.ts.clientIn).toBe(serverIn);
    });

    it("calculates owd (one-way delay)", () => {
      const pastTime = new Date(Date.now() - 100).toISOString();
      const req = createMockRequest({
        headers: {
          "x-ctx-ts": pastTime,
        },
      });

      enrichFromExpress(ctx, req);

      expect(ctx.meta.ts.owd).toBeGreaterThan(0);
    });
  });
});
