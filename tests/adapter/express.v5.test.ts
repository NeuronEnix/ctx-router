import { describe, it, expect, beforeEach } from "vitest";
import { Request, Response } from "express";
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

function createMockResponse(): Response {
  return {} as Response;
}

describe("enrichFromExpress", () => {
  let router: CtxRouter<TDefaultCtx>;
  let ctx: TDefaultCtx;
  let res: Response;

  beforeEach(() => {
    router = new CtxRouter<TDefaultCtx>({ logLevel: "none" });
    ctx = router.createCtx();
    res = createMockResponse();
  });

  describe("route extraction", () => {
    it("sets route pattern and original as path-only", () => {
      const req = createMockRequest({
        method: "POST",
        url: "/api/users",
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.route.raw).toBe("/api/users");
      expect(ctx.req.route.pattern).toBe("PENDING");
      expect(ctx.req.route.op).toBe("POST");
    });

    it("strips query params from path", () => {
      const req = createMockRequest({
        method: "GET",
        url: "/search?q=test&page=1",
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.route.raw).toBe("/search");
    });
  });

  describe("data extraction", () => {
    it("merges body, query, and params into data", () => {
      const req = createMockRequest({
        body: { name: "John" },
        query: { sort: "asc" },
        params: { id: "123" },
      });

      enrichFromExpress(ctx, req, res);

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

      enrichFromExpress(ctx, req, res);

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

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.bearerToken).toBe("abc123token");
    });

    it("extracts api key from x-api-key header", () => {
      const req = createMockRequest({
        headers: {
          "x-api-key": "api-key-123",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.apiKey).toBe("api-key-123");
    });

    it("extracts refresh token from x-ctx-refresh-token header", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-refresh-token": "refresh-token-456",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.refreshToken).toBe("refresh-token-456");
    });

    it("does not set auth when no auth headers present", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth).toBeUndefined();
    });
  });

  describe("transport extraction", () => {
    it("sets protocol to http in transport", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport.protocol).toBe("http");
    });

    it("sets request method and path", () => {
      const req = createMockRequest({
        method: "PUT",
        url: "/api/item/123",
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport.request?.method).toBe("PUT");
      expect(ctx.req.transport.request?.path).toBe("/api/item/123");
    });

    it("sets network info when ip is present", () => {
      const req = createMockRequest({
        ip: "192.168.1.1",
        ips: ["10.0.0.1", "192.168.1.1"],
      });

      enrichFromExpress(ctx, req, res);

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

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport.meta?.["user-agent"]).toBe("Mozilla/5.0");
      expect(ctx.req.transport.meta?.["content-type"]).toBe("application/json");
    });

    it("stores raw request and response references", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport.raw).toEqual({ req, res });
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

      enrichFromExpress(ctx, req, res);

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

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.client?.appVersion).toBe("2.0.0");
      expect(ctx.req.client?.apiVersion).toBe("v2");
    });
  });

  describe("timestamp handling", () => {
    it("sets req.invocation.ts from x-ctx-ts header", () => {
      const clientTimestamp = new Date("2024-01-01T12:00:00Z").toISOString();
      const req = createMockRequest({
        headers: {
          "x-ctx-ts": clientTimestamp,
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.invocation?.ts).toBe(
        new Date("2024-01-01T12:00:00Z").getTime()
      );
    });

    it("does not set req.invocation.ts when x-ctx-ts is missing", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.invocation?.ts).toBeUndefined();
    });

    it("does not mutate meta.ts (timing computed in exec)", () => {
      const pastTime = new Date(Date.now() - 100).toISOString();
      const req = createMockRequest({
        headers: {
          "x-ctx-ts": pastTime,
        },
      });

      const originalTsIn = ctx.meta.ts.in;
      enrichFromExpress(ctx, req, res);

      // Adapter does not touch meta.ts
      expect(ctx.meta.ts.in).toBe(originalTsIn);
    });
  });
});
