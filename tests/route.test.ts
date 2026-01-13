import { describe, it, expect } from "vitest";
import {
  buildRoute,
  parseRoute,
  isCanonicalRoute,
} from "../src/router/route";

describe("Route Utilities", () => {
  describe("buildRoute()", () => {
    it("builds HTTP route with path", () => {
      const route = buildRoute("http", "GET", "/user/:id");
      expect(route).toBe("http GET /user/:id");
    });

    it("builds HTTP route without path", () => {
      const route = buildRoute("http", "POST");
      expect(route).toBe("http POST");
    });

    it("builds SQS queue route", () => {
      const route = buildRoute("sqs", "order.created");
      expect(route).toBe("sqs order.created");
    });

    it("builds gRPC route", () => {
      const route = buildRoute("grpc", "CreateUser");
      expect(route).toBe("grpc CreateUser");
    });

    it("builds Kafka route", () => {
      const route = buildRoute("kafka", "user.registered");
      expect(route).toBe("kafka user.registered");
    });

    it("builds Lambda route", () => {
      const route = buildRoute("lambda", "processOrder");
      expect(route).toBe("lambda processOrder");
    });

    it("builds internal route", () => {
      const route = buildRoute("internal", "cleanup.run");
      expect(route).toBe("internal cleanup.run");
    });

    it("supports custom protocol", () => {
      const route = buildRoute("custom-protocol", "my-operation");
      expect(route).toBe("custom-protocol my-operation");
    });

    it("handles GraphQL with path", () => {
      const route = buildRoute("graphql", "QUERY", "/graphql");
      expect(route).toBe("graphql QUERY /graphql");
    });
  });

  describe("parseRoute()", () => {
    it("parses HTTP route with path", () => {
      const segments = parseRoute("http GET /user/:id");
      expect(segments).toEqual({
        protocol: "http",
        operation: "GET",
        path: "/user/:id",
      });
    });

    it("parses HTTP route with multiple path segments", () => {
      const segments = parseRoute("http POST /api/v1/users");
      expect(segments).toEqual({
        protocol: "http",
        operation: "POST",
        path: "/api/v1/users",
      });
    });

    it("parses SQS queue route", () => {
      const segments = parseRoute("sqs order.created");
      expect(segments).toEqual({
        protocol: "sqs",
        operation: "order.created",
      });
    });

    it("parses gRPC route", () => {
      const segments = parseRoute("grpc CreateUser");
      expect(segments).toEqual({
        protocol: "grpc",
        operation: "CreateUser",
      });
    });

    it("parses Kafka route", () => {
      const segments = parseRoute("kafka user.registered");
      expect(segments).toEqual({
        protocol: "kafka",
        operation: "user.registered",
      });
    });

    it("parses internal route", () => {
      const segments = parseRoute("internal cleanup.run");
      expect(segments).toEqual({
        protocol: "internal",
        operation: "cleanup.run",
      });
    });

    it("handles fallback for non-canonical format", () => {
      const segments = parseRoute("/user/:id");
      expect(segments).toEqual({
        protocol: "unknown",
        operation: "/user/:id",
      });
    });

    it("handles empty string gracefully", () => {
      const segments = parseRoute("");
      expect(segments).toEqual({
        protocol: "unknown",
        operation: "",
      });
    });

    it("handles single segment", () => {
      const segments = parseRoute("someRoute");
      expect(segments).toEqual({
        protocol: "unknown",
        operation: "someRoute",
      });
    });
  });

  describe("isCanonicalRoute()", () => {
    it("validates canonical HTTP route with path", () => {
      expect(isCanonicalRoute("http GET /user/:id")).toBe(true);
    });

    it("validates canonical queue route", () => {
      expect(isCanonicalRoute("sqs order.created")).toBe(true);
    });

    it("validates canonical gRPC route", () => {
      expect(isCanonicalRoute("grpc CreateUser")).toBe(true);
    });

    it("validates canonical internal route", () => {
      expect(isCanonicalRoute("internal cleanup.run")).toBe(true);
    });

    it("rejects legacy HTTP format", () => {
      expect(isCanonicalRoute("GET /user/:id")).toBe(false);
    });

    it("rejects single segment", () => {
      expect(isCanonicalRoute("/user/:id")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isCanonicalRoute("")).toBe(false);
    });

    it("validates three-segment route", () => {
      expect(isCanonicalRoute("graphql QUERY /graphql")).toBe(true);
    });

    it("rejects four-segment route (too many)", () => {
      expect(isCanonicalRoute("http GET /api /v1")).toBe(false);
    });
  });

  describe("round-trip (build → parse)", () => {
    it("maintains HTTP route with path", () => {
      const original = { protocol: "http", operation: "GET", path: "/user/:id" };
      const route = buildRoute(original.protocol, original.operation, original.path);
      const parsed = parseRoute(route);
      expect(parsed).toEqual(original);
    });

    it("maintains queue route", () => {
      const original = { protocol: "sqs", operation: "order.created" };
      const route = buildRoute(original.protocol, original.operation);
      const parsed = parseRoute(route);
      expect(parsed).toEqual(original);
    });

    it("maintains gRPC route", () => {
      const original = { protocol: "grpc", operation: "CreateUser" };
      const route = buildRoute(original.protocol, original.operation);
      const parsed = parseRoute(route);
      expect(parsed).toEqual(original);
    });
  });
});
