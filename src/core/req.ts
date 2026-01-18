export type CtxReq<Data = Record<string, unknown>> = {
  /**
   * Unified input payload for business logic.
   * Adapter MUST merge params + query + body using:
   * params < query < body (body has highest priority).
   */
  data: Data;

  /**
   * Route data (op + raw + pattern).
   * Adapter sets op/raw (concrete values for this invocation).
   * Router reassigns pattern after matching.
   */
  route: {
    /**
     * Operation identifier (optional).
     * Examples: "GET", "POST", "order.created", "CreateUser"
     * - For HTTP: method (GET, POST, etc.)
     * - For events: event name
     * - For gRPC: RPC method name
     * If undefined, routes without op act as wildcard matches.
     */
    op?: string;

    /**
     * Concrete route value for this invocation (high-cardinality).
     * Examples:
     * - HTTP: "/users/123" (uses "/" separator)
     * - Event: "order.abc.created" (uses "." separator)
     * - gRPC: "pkg.Service.Method" (uses "." separator)
     *
     * Adapter sets this to the concrete path/operation.
     * Remains unchanged after routing.
     */
    raw: string;

    /**
     * Matched route pattern (low-cardinality, identity).
     * Examples:
     * - HTTP: "/users/:id"
     * - Event: "order.:id.created"
     * - gRPC: "pkg.Service.:method"
     *
     * Initially set to "PENDING" by createCtx().
     * Router reassigns to matched pattern after route matching.
     */
    pattern: string;
  };

  /**
   * Raw authorization payload from the ingress.
   * Consumed by auth handlers to populate ctx.user.
   * All values are strings by design.
   */
  auth?: {
    bearerToken?: string;
    apiKey?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    [key: string]: string | undefined;
  };

  /**
   * Client-provided hints (device / app metadata).
   */
  client?: {
    deviceName?: string;
    deviceId?: string;
    os?: string;
    appVersion?: string;
    apiVersion?: string;
    sessionId?: string;
  };

  /**
   * Caller-provided invocation hints (not authoritative).
   * clientInvocation contains caller-provided hints only.
   * Canonical values are resolved into ctx.meta.
   * Used by adapters/tracing middleware to adopt, override, or ignore client hints.
   */
  clientInvocation?: {
    traceId?: string;
    spanId?: string;
    seq?: number;
    ts?: number; // epoch ms
    traceparent?: string;
  };

  /**
   * Transport-level details (debug / escape hatch).
   * Not intended for business logic.
   */
  transport?: {
    /**
     * Transport protocol identifier (source-of-truth).
     * Examples: "http", "grpc", "graphql", "lambda", "sqs", "kafka", "internal"
     */
    protocol?:
      | "http"
      | "grpc"
      | "graphql"
      | "lambda"
      | "sqs"
      | "kafka"
      | "internal"
      | string;

    framework?: "express" | "fastify" | "lambda" | string;
    /**
     * Protocol-level addressing or operation info.
     */
    request?: {
      method?: string;
      path?: string;
      op?: string;
    };

    data?: {
      params?: Record<string, string>;
      query?: Record<string, string>;
      body?: Record<string, unknown>;
      [key: string]: unknown;
    };

    /**
     * Network-related information, if applicable.
     */
    network?: {
      originIp?: string;
      hops?: string[];
    };

    /**
     * Protocol-specific metadata (queue, topic, partition, etc.).
     */
    meta?: Record<string, string>;

    /**
     * Native ingress object(s) as provided by the platform.
     * Examples:
     * - Express/Fastify: request object
     * - Lambda: event/context
     * - gRPC: call/metadata
     */
    raw: { [key: string]: unknown } | null;
  };
};
