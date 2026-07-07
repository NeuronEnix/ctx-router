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
    ctx = router.newCtx();
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

    it("body overrides query which overrides params", () => {
      const req = createMockRequest({
        body: { field: "body" },
        query: { field: "query" },
        params: { field: "params" },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.data.field).toBe("body");
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

    it("extracts clientId and clientSecret from Authorization: Basic", () => {
      const encoded = Buffer.from("my-id:my-secret").toString("base64");
      const req = createMockRequest({
        headers: { authorization: `Basic ${encoded}` },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.clientId).toBe("my-id");
      expect(ctx.req.auth?.clientSecret).toBe("my-secret");
      expect(ctx.req.auth?.bearerToken).toBeUndefined();
    });

    it("preserves empty clientSecret in Basic auth (id-only credentials)", () => {
      const encoded = Buffer.from("public-client:").toString("base64");
      const req = createMockRequest({
        headers: { authorization: `Basic ${encoded}` },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.clientId).toBe("public-client");
      expect(ctx.req.auth?.clientSecret).toBe("");
    });

    it("ignores malformed Basic auth (no colon after decode)", () => {
      const encoded = Buffer.from("no-colon-here").toString("base64");
      const req = createMockRequest({
        headers: { authorization: `Basic ${encoded}` },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.clientId).toBeUndefined();
      expect(ctx.req.auth?.clientSecret).toBeUndefined();
    });

    it("ignores unknown Authorization schemes", () => {
      const req = createMockRequest({
        headers: { authorization: "Digest realm=foo" },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth).toBeUndefined();
    });

    it("prefers x-ctx-api-key over x-api-key", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-api-key": "ctx-key",
          "x-api-key": "plain-key",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.apiKey).toBe("ctx-key");
    });

    it("falls back to x-api-key when x-ctx-api-key is absent", () => {
      const req = createMockRequest({
        headers: { "x-api-key": "plain-key" },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.apiKey).toBe("plain-key");
    });

    it("falls back to apikey when neither x-ctx-api-key nor x-api-key is set", () => {
      const req = createMockRequest({
        headers: { apikey: "lowercase-key" },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.auth?.apiKey).toBe("lowercase-key");
    });
  });

  describe("transport extraction", () => {
    it("sets protocol to http in transport", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport?.protocol).toBe("http");
    });

    it("sets request method and path", () => {
      const req = createMockRequest({
        method: "PUT",
        url: "/api/item/123",
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport?.request?.method).toBe("PUT");
      expect(ctx.req.transport?.request?.path).toBe("/api/item/123");
    });

    it("sets network info when ip is present", () => {
      const req = createMockRequest({
        ip: "192.168.1.1",
        ips: ["10.0.0.1", "192.168.1.1"],
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport?.network?.originIp).toBe("192.168.1.1");
      expect(ctx.req.transport?.network?.hops).toEqual([
        "10.0.0.1",
        "192.168.1.1",
      ]);
    });

    it("stores raw request and response references", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport?.raw).toEqual({ req, res });
    });

    it("stashes all request headers in transport.data.headers", () => {
      const req = createMockRequest({
        headers: {
          "x-custom-header": "custom-value",
          "x-multi-header": ["a", "b"],
          authorization: "Bearer abc",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport?.data?.headers).toEqual({
        "x-custom-header": "custom-value",
        "x-multi-header": ["a", "b"],
        authorization: "Bearer abc",
      });
    });

    it("does not set transport.data when no headers are present", () => {
      const req = createMockRequest({ headers: {} });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.transport?.data).toBeUndefined();
    });
  });

  describe("caller identity extraction", () => {
    it("extracts app/api/session/device info into caller", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-app-version": "2.0.0",
          "x-ctx-api-version": "v2",
          "x-ctx-session-id": "sess-abc",
          "x-ctx-device-id": "device-xyz",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.appVersion).toBe("2.0.0");
      expect(ctx.req.caller?.apiVersion).toBe("v2");
      expect(ctx.req.caller?.sessionId).toBe("sess-abc");
      expect(ctx.req.caller?.deviceId).toBe("device-xyz");
    });

    it("extracts traceparent and x-ctx-span-id into caller", () => {
      const req = createMockRequest({
        headers: {
          traceparent:
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
          "x-ctx-span-id": "span-42",
          "x-ctx-trace-id": "trace-42",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.traceparent).toBe(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
      );
      expect(ctx.req.caller?.spanId).toBe("span-42");
      expect(ctx.req.caller?.traceId).toBe("trace-42");
    });
  });

  describe("timestamp handling", () => {
    it("sets req.caller.ts from epoch-ms x-ctx-client-ts header", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-client-ts": "1704110400000",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.ts).toBe(1704110400000);
    });

    it("ignores non-numeric x-ctx-client-ts values", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-client-ts": "2024-01-01T12:00:00Z",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.ts).toBeUndefined();
    });

    it("ignores non-numeric x-ctx-ingress-in values", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-ingress-in": "12abc",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.ingressIn).toBeUndefined();
    });

    it("does not set req.caller.ts when x-ctx-client-ts is missing", () => {
      const req = createMockRequest();

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.ts).toBeUndefined();
    });

    it("sets req.caller.ingressIn from x-ctx-ingress-in header", () => {
      const req = createMockRequest({
        headers: {
          "x-ctx-ingress-in": "1716206400123",
        },
      });

      enrichFromExpress(ctx, req, res);

      expect(ctx.req.caller?.ingressIn).toBe(1716206400123);
    });

    it("does not mutate meta.ts (timing computed in exec)", () => {
      const pastTime = new Date(Date.now() - 100).toISOString();
      const req = createMockRequest({
        headers: {
          "x-ctx-client-ts": pastTime,
        },
      });

      const originalTsIn = ctx.meta.ts.in;
      enrichFromExpress(ctx, req, res);

      // Adapter does not touch meta.ts
      expect(ctx.meta.ts.in).toBe(originalTsIn);
    });
  });
});
