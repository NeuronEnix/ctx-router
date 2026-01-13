export type CtxReq<Data = Record<string, unknown>> = {
  /**
   * Unified input payload for business logic.
   * Adapter MUST merge params + query + body using:
   * params < query < body (body has highest priority).
   */
  data: Data;

  /**
   * Matched route parameters from the router.
   * Set by the router during route matching.
   * Example: For route "/users/:id" matched with "/users/123", params = { id: "123" }
   */
  params?: Record<string, string>;

  /**
   * Route data (action + pattern).
   * Adapter sets action/original (path-only for HTTP).
   * Router reassigns pattern after matching.
   */
  route: {
    /**
     * Action or operation identifier (optional).
     * Examples: "GET", "order.created", "CreateUser", "cleanup.run"
     * For HTTP: method (GET, POST, etc.)
     * For events: event name
     * If undefined, routes without action act as wildcard matches.
     */
    action?: string;

    /**
     * Canonical route pattern (low-cardinality, first-class).
     * Examples:
     * - HTTP: "/users/:id" (path-only, no method)
     * - Event: "order.created"
     * - Internal: "cleanup.run"
     *
     * Adapter initially sets this to the raw path/operation.
     * Router reassigns after finding matching pattern.
     */
    pattern: string;

    /**
     * Concrete route for this invocation (may be high-cardinality).
     * Examples:
     * - HTTP: "/users/123" (path-only, no method)
     * - Event: "order.created"
     *
     * Adapter sets this to the raw path/operation.
     * Remains unchanged after routing.
     */
    original: string;
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
