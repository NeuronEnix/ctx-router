export type CtxReq<Data = Record<string, unknown>> = {
  /**
   * Unified input payload for business logic.
   * Adapter MUST merge params + query + body using:
   * params < query < body (body has highest priority).
   */
  data: Data;

  /**
   * Canonical route pattern (low-cardinality, first-class).
   * Examples:
   * - "GET /users/:id"
   * - "sqs:order.created"
   * - "internal cleanup.run"
   *
   * Adapter initially sets this to the raw path.
   * Router reassigns after finding matching pattern.
   */
  route: string;

  /**
   * Concrete route for this invocation (may be high-cardinality).
   * Examples:
   * - "GET /users/123"
   * - "sqs:order.created"
   *
   * Adapter sets this to the raw path.
   * Remains unchanged after routing.
   */
  routeValue: string;

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
   * Invocation-level metadata provided by the caller.
   */
  invocation?: {
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
     * Transport protocol identifier.
     * Examples: "http", "grpc", "graphql", "lambda", "sqs", "kafka", "internal"
     */
    protocol:
      | "http"
      | "grpc"
      | "graphql"
      | "lambda"
      | "sqs"
      | "kafka"
      | "internal"
      | string;

    /**
     * Protocol-level addressing or operation info.
     */
    request?: {
      method?: string;
      path?: string;
      operation?: string;
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
