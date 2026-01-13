/**
 * Canonical route format utilities.
 *
 * Purpose: Provide a consistent route string format across all transports
 * that avoids `:` conflicts with path-to-regexp parameter syntax.
 *
 * Format: `<protocol> <operation> [<path>]`
 * Delimiter: Single space (` `)
 *
 * Examples:
 * - HTTP: `http GET /user/:id`
 * - SQS: `sqs order.created`
 * - gRPC: `grpc CreateUser`
 * - Kafka: `kafka order.created`
 * - Internal: `internal cleanup.run`
 *
 * Rationale:
 * - Space delimiter avoids `:` conflicts with path-to-regexp
 * - First segment is always protocol (low-cardinality)
 * - Remaining segments define the operation (transport-specific)
 * - Compatible with existing HTTP routes when protocol is omitted
 */

export type RouteProtocol =
  | "http"
  | "grpc"
  | "graphql"
  | "lambda"
  | "sqs"
  | "kafka"
  | "internal"
  | string;

export type RouteSegments = {
  protocol: RouteProtocol;
  operation: string;
  path?: string;
};

/**
 * Builds a canonical route string from protocol and operation segments.
 *
 * @param protocol - Transport protocol (http, grpc, sqs, etc.)
 * @param operation - Operation identifier (method, event name, RPC name)
 * @param path - Optional path for protocols that use it (HTTP, GraphQL)
 * @returns Canonical route string
 *
 * @example
 * buildRoute("http", "GET", "/user/:id")  // => "http GET /user/:id"
 * buildRoute("sqs", "order.created")      // => "sqs order.created"
 * buildRoute("grpc", "CreateUser")        // => "grpc CreateUser"
 */
export function buildRoute(
  protocol: RouteProtocol,
  operation: string,
  path?: string
): string {
  if (path) {
    return `${protocol} ${operation} ${path}`;
  }
  return `${protocol} ${operation}`;
}

/**
 * Parses a canonical route string into its segments.
 *
 * @param route - Canonical route string
 * @returns Route segments object
 *
 * @example
 * parseRoute("http GET /user/:id")  // => { protocol: "http", operation: "GET", path: "/user/:id" }
 * parseRoute("sqs order.created")   // => { protocol: "sqs", operation: "order.created" }
 */
export function parseRoute(route: string): RouteSegments {
  const parts = route.split(" ");

  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return {
      protocol: parts[0],
      operation: parts[1],
      path: parts[2],
    };
  }

  if (parts.length === 2 && parts[0] && parts[1]) {
    return {
      protocol: parts[0],
      operation: parts[1],
    };
  }

  // Fallback: treat entire string as operation with unknown protocol
  return {
    protocol: "unknown",
    operation: route,
  };
}

/**
 * Checks if a route string is in canonical format.
 *
 * @param route - Route string to validate
 * @returns True if route follows canonical format
 *
 * @example
 * isCanonicalRoute("http GET /user/:id")  // => true
 * isCanonicalRoute("sqs order.created")   // => true
 * isCanonicalRoute("/user/:id")           // => false (legacy format)
 * isCanonicalRoute("GET /user/:id")       // => false (missing protocol)
 */
export function isCanonicalRoute(route: string): boolean {
  const parts = route.split(" ");

  // Must have 2 or 3 parts
  if (parts.length < 2 || parts.length > 3) {
    return false;
  }

  // First part must not start with "/" (it's the protocol, not a path)
  // This rejects legacy formats like "GET /user/:id"
  if (parts[0] && parts[0].startsWith("/")) {
    return false;
  }

  // If 2 parts, second part must not start with "/" (it's the operation)
  // This rejects formats like "protocol /path"
  if (parts.length === 2 && parts[1] && parts[1].startsWith("/")) {
    return false;
  }

  return true;
}
