# ctx-router

[![npm version](https://img.shields.io/npm/v/ctx-router.svg)](https://www.npmjs.com/package/ctx-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Bundle Size](https://img.shields.io/badge/Bundle%20Size-37KB-brightgreen.svg)](https://github.com/NeuronEnix/ctx-router)
[![Tests](https://img.shields.io/badge/Tests-76%20passing-brightgreen.svg)](https://github.com/NeuronEnix/ctx-router)

A transport-agnostic router that normalizes all request types into a single unified context.

Write your business logic once. Run it on Express, Lambda, SQS, gRPC, or any other transport—without changing a single handler.

## Why ctx-router?

Most applications start simple with HTTP endpoints, then reality hits:

- You add background jobs (SQS, Kafka, cron)
- You need async workers for long-running tasks
- You deploy to Lambda or another serverless runtime
- You want to reuse business logic across transports
- You end up **duplicating logic** everywhere

**The problem isn't routing. The problem is transport leakage into business logic.**

ctx-router solves this by:

- Normalizing all ingress types into a **single context**
- Routing based on **patterns**, not frameworks
- Executing logic as a **linear pipeline**
- Keeping transport concerns at the **boundaries**

## Core Principle

Everything becomes a `ctx`. Routes select a pipeline. Pipelines transform the `ctx`.

Your business logic never touches raw framework objects—it only sees context.

## Features

- **Unified Context** - Single object flows through your entire system
- **Fluent Route Builder** - Expressive DSL with `route()`, `via()`, `to()`
- **Lifecycle Hooks** - Cross-cutting concerns (logging, tracing, error handling)
- **Pattern Matching** - Supports `:param` extraction with `path-to-regexp`
- **HTTP Grammar** - Auto-detect method and path from `"GET /user/:id"`
- **Type-Safe** - Full TypeScript support with custom context extensions
- **Framework-Agnostic** - Currently Express, easily extensible to any transport

## Installation

```bash
npm install ctx-router
```

## Quick Start

### 1. Define Your Router

```typescript
// router.ts
import { CtxRouter, CtxType, CtxErr } from "ctx-router";

// Extend the default context with your app-specific fields
export type TCtx = CtxType.DefaultCtx & {
  user: { role: string[] };
};

// Define application errors
class AppErr extends CtxErr.BaseError {
  constructor(e: CtxType.BaseError) {
    super(e);
  }
}

export const appErr = CtxErr.errMap(AppErr, {
  auth: {
    UNAUTHORIZED: "Unauthorized",
    INVALID_TOKEN: "Invalid token",
  },
  general: {
    NOT_FOUND: "Not found",
    UNKNOWN_ERROR: "Something went wrong",
  },
});

// Create router instance
export const router = new CtxRouter<TCtx>({
  serviceName: "my-service",
  logLevel: "standard", // none | minimal | standard | verbose
});
```

### 2. Register Routes

```typescript
// router.ts (continued)
import * as api from "./api";

// Simple route with HTTP grammar auto-detection
router.route("GET /health/ping").to(api.health.ping);

// Route with middleware chain
router
  .route("GET /health/check")
  .via(logMiddleware, authMiddleware)
  .to(api.health.check);

// Route inheritance with shared middleware
const userRouter = router
  .route("user")
  .via(rateLimitMiddleware, authMiddleware);

userRouter.route("POST /update").to(api.user.update);
userRouter.route("GET /:userId").to(api.user.detail);

// Dot-notation pattern (alternative)
userRouter.route("detail").to(api.user.detail);
```

### 3. Create Handlers

```typescript
// api/user/userUpdate.api.ts
import { TCtx, appErr } from "../../router";

// 1. Authentication - validate permissions
export async function auth(ctx: TCtx): Promise<TCtx> {
  const allowedRoles = ["user", "admin"];
  if (ctx.user.role.some((r) => allowedRoles.includes(r))) {
    return ctx;
  }
  throw appErr.auth.UNAUTHORIZED();
}

// 2. Validation - extract and validate request data
export async function validate(ctx: TCtx): Promise<TReqData> {
  const { userId, userName } = ctx.req.data;
  if (!userId || !userName) {
    throw appErr.general.MALFORMED_REQUEST_DATA();
  }
  return { userId, userName };
}

// 3. Business Logic - pure function, transport-agnostic
export async function execute(reqData: TReqData): Promise<TResData> {
  // Your business logic here - no ctx, no transport concerns
  return {
    userId: reqData.userId,
    userName: reqData.userName,
  };
}

type TReqData = { userId: string; userName: string };
type TResData = { userId: string; userName: string };
```

### 4. Integrate with Express

```typescript
// server.ts
import express from "express";
import { CtxAdapter } from "ctx-router";
import { router, TCtx } from "./router";

const app = express();
app.use(express.json());

// Register lifecycle hook
router.hook.onExec.before(async (ctx) => {
  console.log(`[Request] ${ctx.id} - ${ctx.req.route.raw}`);
});

// Single middleware handles all routes
app.use(async (req, res) => {
  // 1. Create context with defaults
  const ctx: TCtx = router.newCtx();

  // 2. Enrich context with Express request data
  CtxAdapter.enrichFromExpress(ctx, req, res);

  // 3. Execute route (runs hooks, matches route, executes handler)
  await router.exec(ctx);

  // 4. Send response
  const httpCode = ctx.res.code === "OK" ? 200 : 400;
  res.status(httpCode).json(ctx.res);
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
```

That's it! Your business logic is now decoupled from Express and ready to run on any transport.

## Core Concepts

### Context (`CtxType.DefaultCtx`)

The single object that flows through your entire system:

```typescript
type DefaultCtx = {
  id: string; // Unique request ID (traceId)
  req: CtxReq; // Request data (see below)
  res: CtxRes; // Response data (see below)
  user: CtxUser; // Authenticated user/service
  meta: CtxMeta; // Metadata (timing, instance, monitoring)
  locals: Record<string, unknown>; // Request-scoped storage
  err: CtxErr.BaseError | null; // Captured error (if any)
};
```

**CtxReq** - Request data:

```typescript
type CtxReq = {
  data: Record<string, unknown>; // Merged params + query + body
  route: {
    op?: string; // HTTP method, event name, gRPC method
    raw: string; // Concrete path/operation ("/user/123")
    pattern: string; // Matched pattern ("/user/:id")
  };
  auth?: {
    // Optional auth tokens
    bearerToken?: string;
    apiKey?: string;
    refreshToken?: string;
  };
  client?: {
    // Optional client metadata
    deviceName?: string;
    deviceId?: string;
    sessionId?: string;
  };
  clientInvocation?: {
    // Optional client trace hints
    traceId?: string;
    ts?: number; // Client timestamp
  };
  transport?: {
    // Transport-level details
    protocol?: string; // "http", "grpc", "sqs", etc.
    framework?: string; // "express", "fastify", "lambda"
    raw: any; // Native transport object
  };
};
```

**CtxRes** - Response data:

```typescript
type CtxRes = {
  code: string; // Domain code ("OK", "ERROR", "NOT_FOUND")
  msg: string; // Human-readable message
  data: Record<string, unknown>; // Response payload
};
```

**CtxUser** - Authenticated caller:

```typescript
type CtxUser = {
  kind: "user" | "service";
  id: string; // Unique user/service ID
  role: string[]; // Roles (e.g., ["user", "admin"])
  scope: string[]; // Fine-grained permissions
  handle: string | null; // Username or service name
};
```

**CtxMeta** - Request metadata:

```typescript
type CtxMeta = {
  serviceName: string; // Service identifier
  instance: {
    id: string; // Instance ID
    seq: number; // Request sequence number
    inflight: number; // Current in-flight requests
    cpu: number; // CPU usage (%)
    mem: number; // Memory usage (MB)
  };
  ts: {
    in: number; // Request arrival time
    out: number; // Response sent time
    execTime: number; // Total execution time
    clientIn: number; // Client timestamp
    owd: number; // One-way delay
  };
  monitor: {
    traceId: string; // Distributed trace ID
    spanId: string; // Span ID
  };
  log: {
    // Optional log storage
    stdout: any[];
    db: any[];
  };
};
```

### Extending Context

Extend `CtxType.DefaultCtx` to add application-specific fields:

```typescript
import { CtxType } from "ctx-router";

export type TCtx = CtxType.DefaultCtx & {
  user: {
    role: ("user" | "admin")[];
    organizationId?: string;
  };
  locals: {
    dbConnection?: DatabaseConnection;
    cache?: Cache;
  };
};
```

### Route Builder DSL

Routes are built using a fluent, immutable builder pattern:

#### `route(segment: string)`

Adds a path segment to the route:

```typescript
// Dot notation (default)
router.route("user").route(":id").route("detail");
// Pattern: "user.:id.detail"

// HTTP grammar (auto-detected)
router.route("GET /user/:id");
// Pattern: "/user/:id", op: "GET"

// Mixed segments
router.route("api").route("GET /user/:id");
// Pattern: "/api/user/:id", op: "GET"
```

#### `via(...middleware)`

Adds middleware to the pipeline. Middleware runs sequentially:

```typescript
router
  .route("user")
  .via(auth, validate) // Runs in order
  .to(handler);

// Middleware signature
async function auth(ctx: TCtx): Promise<TCtx> {
  // Validate and return ctx
  return ctx;
}
```

#### `to(handler)`

Registers the terminal handler. This ends the builder chain:

```typescript
router.route("GET /user/:id").to(async (ctx) => {
  ctx.res.data = { userId: ctx.req.data.id };
  return ctx;
});
```

### Route Inheritance

Child routes inherit parent middleware:

```typescript
const userRouter = router.route("user").via(authMiddleware);

// Both routes inherit authMiddleware
userRouter.route("GET /:id").to(api.user.detail);
userRouter.route("POST /update").to(api.user.update);
```

### Global Middleware

Apply middleware to all routes:

```typescript
router.via(logMiddleware, metricsMiddleware);

// All routes registered after this will include these middleware
router.route("GET /health").to(api.health.ping);
```

### Route Patterns

ctx-router supports two pattern styles:

**Dot Notation (Default)**

```typescript
router.route("user.:id.detail").to(handler);
// Matches: "user.123.detail"
```

**HTTP Grammar**

```typescript
router.route("GET /user/:id").to(handler);
// Matches: GET /user/123
// Automatically registers both:
//   - "/user/:id" with op="GET"
//   - "user.:id" (dot notation fallback)
```

**Parameters**

Path parameters are extracted and merged into `ctx.req.data`:

```typescript
router.route("GET /user/:userId/post/:postId").to(async (ctx) => {
  // ctx.req.data = { userId: "123", postId: "456", ...otherData }
  return ctx;
});
```

### Lifecycle Hooks

Hooks wrap the execution lifecycle and allow cross-cutting concerns:

```typescript
// Before routing (setup, context enrichment)
router.hook.onExec.before(async (ctx) => {
  console.log(`[IN] ${ctx.id}`);
  ctx.locals.startTime = Date.now();
});

// After successful execution (cleanup, metrics)
router.hook.onExec.after(async (ctx) => {
  console.log(`[OK] ${ctx.id}`);
});

// On any error (format error response, log)
router.hook.onExec.error(async (ctx, err) => {
  console.error(`[ERROR] ${ctx.id}:`, err);
  ctx.res.code = "ERROR";
  ctx.res.msg = err.message;
});

// Always runs (finalization, tracing)
router.hook.onExec.finally(async (ctx) => {
  console.log(`[DONE] ${ctx.id} - ${ctx.meta.ts.execTime}ms`);
});
```

**Hook Execution Order:**

```
1. onExec.before
2. Route matching
3. Middleware pipeline
4. Handler execution
5. onExec.after (on success) OR onExec.error (on failure)
6. onExec.finally (always)
```

**Important:** Hooks are sealed after the first `exec()` call. You cannot modify hooks after routing begins.

### Error Handling

ctx-router provides structured error handling with `CtxErr.BaseError` and `CtxErr.errMap`.

#### Creating Error Maps

```typescript
import { CtxErr, CtxType } from "ctx-router";

class AppError extends CtxErr.BaseError {
  constructor(e: CtxType.BaseError) {
    super(e);
  }
}

export const appErr = CtxErr.errMap(AppError, {
  auth: {
    UNAUTHORIZED: "Unauthorized",
    TOKEN_EXPIRED: "Token expired",
    INVALID_TOKEN: "Invalid token",
  },
  user: {
    NOT_FOUND: "User not found",
    ALREADY_EXISTS: "User already exists",
  },
  general: {
    UNKNOWN_ERROR: "Something went wrong",
  },
});
```

#### Throwing Errors

```typescript
// Simple throw
throw appErr.auth.UNAUTHORIZED();

// With additional data
throw appErr.user.NOT_FOUND({
  msg: "User with this ID was not found", // Override default message
  data: { userId: "123" }, // Data sent to client
  info: { stack: "..." }, // Internal info (not sent to client)
});
```

#### Error Structure

```typescript
type BaseError = {
  name: string; // "UNAUTHORIZED"
  msg: string; // Human-readable message
  data: Record<string, unknown>; // Safe to send to client
  info: Record<string, unknown>; // Internal only (logs, stack traces)
};
```

#### Handling Errors

```typescript
router.hook.onExec.error(async (ctx, err) => {
  if (err instanceof AppError) {
    ctx.res.code = err.name;
    ctx.res.msg = err.msg;
    ctx.res.data = err.data;
  } else {
    ctx.res.code = "UNKNOWN_ERROR";
    ctx.res.msg = "An unexpected error occurred";
  }
  ctx.err = err;
});
```

## Adapters

Adapters enrich the context with transport-specific data. Currently supported:

### Express Adapter

```typescript
import { CtxAdapter } from "ctx-router";

CtxAdapter.enrichFromExpress(ctx, req, res);
```

The Express adapter extracts:

- **Method & Path**: HTTP method and request path
- **Data**: Merged `req.params`, `req.query`, `req.body`
- **Auth**: Bearer token, API key, refresh token from headers
- **Client Info**: Device name, ID, OS, app version from custom headers
- **Invocation**: Trace ID, sequence, timestamp from custom headers
- **Transport**: Protocol (`http`), framework (`express`), raw request/response

**Custom Headers Supported:**

- `x-api-key` - API key authentication
- `x-ctx-refresh-token` - Refresh token
- `x-ctx-device-name`, `x-ctx-device-id` - Device info
- `x-ctx-os`, `x-ctx-app-version`, `x-ctx-api-version` - Client version info
- `x-ctx-session-id` - Session identifier
- `x-ctx-trace-id`, `x-ctx-seq`, `x-ctx-ts` - Client tracing hints

### Future Adapters

Planned adapters include:

- **AWS Lambda** - Serverless functions
- **SQS/Kafka** - Message queues and event streams
- **gRPC** - High-performance RPC
- **Fastify** - Fast HTTP framework

Creating custom adapters is straightforward—see the Express adapter source for reference.

## Handler Pattern

The recommended pattern for handlers is a three-function approach:

```typescript
// 1. Authentication - validates permissions
export async function auth(ctx: TCtx): Promise<TCtx> {
  // Check user roles, validate tokens
  if (!hasPermission(ctx.user)) {
    throw appErr.auth.UNAUTHORIZED();
  }
  return ctx;
}

// 2. Validation - extracts and validates request data
export async function validate(ctx: TCtx): Promise<TReqData> {
  const { userId, email } = ctx.req.data;
  if (!userId || !isValidEmail(email)) {
    throw appErr.general.INVALID_INPUT();
  }
  return { userId, email };
}

// 3. Business Logic - pure function, no transport concerns
export async function execute(reqData: TReqData): Promise<TResData> {
  // Pure business logic - no ctx dependency
  const user = await db.users.update(reqData.userId, {
    email: reqData.email,
  });
  return { user };
}

type TReqData = { userId: string; email: string };
type TResData = { user: User };
```

You can compose these in your middleware chain:

```typescript
router
  .route("POST /user/update")
  .via(api.user.update.auth, api.user.update.validate)
  .to(async (ctx) => {
    const reqData = await api.user.update.validate(ctx);
    const resData = await api.user.update.execute(reqData);
    ctx.res.data = resData;
    return ctx;
  });
```

Or create a wrapper helper:

```typescript
function wrapHandler<TReq, TRes>(handler: {
  auth?: (ctx: TCtx) => Promise<TCtx>;
  validate: (ctx: TCtx) => Promise<TReq>;
  execute: (req: TReq) => Promise<TRes>;
}) {
  return async (ctx: TCtx): Promise<TCtx> => {
    if (handler.auth) await handler.auth(ctx);
    const reqData = await handler.validate(ctx);
    const resData = await handler.execute(reqData);
    ctx.res.data = resData;
    return ctx;
  };
}

// Usage
router.route("POST /user/update").to(wrapHandler(api.user.update));
```

## API Reference

### CtxRouter

#### Constructor

```typescript
new CtxRouter<TCtx>(config?: CtxRouterConfig)
```

**Config Options:**

- `serviceName?: string` - Service identifier for metadata (default: "unknown")
- `logLevel?: LogLevel` - Logging verbosity: `"none"` | `"minimal"` | `"standard"` | `"verbose"` (default: `"standard"`)

#### Methods

**`newCtx(protocol?: string): TCtx`**

Creates a new context with default values. Call this before enriching with adapter data.

```typescript
const ctx = router.newCtx("http");
```

**`exec(ctx: TCtx): Promise<TCtx>`**

Executes routing for the given context. Runs lifecycle hooks, matches routes, and executes handlers.

```typescript
await router.exec(ctx);
```

**`route(segment: string): RouteBuilder<TCtx>`**

Starts a route builder chain with the given segment.

```typescript
router.route("user");
router.route("GET /user/:id");
```

**`via(...middleware): Pick<RouteBuilder, 'route' | 'via'>`**

Adds global middleware that applies to all subsequently registered routes.

```typescript
router.via(logMiddleware, authMiddleware);
```

#### Properties

**`hook: THookDSL<TCtx>`**

Hook registration interface. Hooks are sealed after the first `exec()` call.

```typescript
router.hook.onExec.before(async (ctx) => {
  /* ... */
});
router.hook.onExec.after(async (ctx) => {
  /* ... */
});
router.hook.onExec.error(async (ctx, err) => {
  /* ... */
});
router.hook.onExec.finally(async (ctx) => {
  /* ... */
});
```

**`INSTANCE: TRouterInstance`**

Readonly instance metadata:

```typescript
{
  ID: string; // Unique instance ID
  SERVICE_NAME: string; // Service name from config
  CREATED_AT: number; // Instance creation timestamp
  SEQ: number; // Total requests processed
  INFLIGHT: number; // Current in-flight requests
}
```

**`logLevel: LogLevel`**

Current logging level.

### RouteBuilder

Immutable builder for route registration.

**`route(segment: string): RouteBuilder<TCtx>`**

Adds a segment to the route pattern.

**`via(...middleware): RouteBuilder<TCtx>`**

Adds middleware to the pipeline.

**`to(handler): void`**

Registers the terminal handler and completes route registration.

## Complete Example

Here's a full example with multiple routes, middleware, error handling, and Express integration:

```typescript
// router.ts
import { CtxRouter, CtxType, CtxErr, DEFAULT_USER_ROLE } from "ctx-router";

// Extend context
export type TCtx = CtxType.DefaultCtx & {
  user: { role: (keyof typeof DEFAULT_USER_ROLE)[] };
};

// Define errors
class AppErr extends CtxErr.BaseError {
  constructor(e: CtxType.BaseError) {
    super(e);
  }
}

export const appErr = CtxErr.errMap(AppErr, {
  auth: {
    UNAUTHORIZED: "Unauthorized",
    TOKEN_EXPIRED: "Token expired",
  },
  user: {
    NOT_FOUND: "User not found",
  },
  general: {
    UNKNOWN_ERROR: "Something went wrong",
  },
});

// Middleware
const logMiddleware = async (ctx: TCtx): Promise<TCtx> => {
  console.log(`[LOG] ${ctx.req.route.op} ${ctx.req.route.raw}`);
  return ctx;
};

const authMiddleware = async (ctx: TCtx): Promise<TCtx> => {
  const token = ctx.req.auth?.bearerToken;
  if (!token) throw appErr.auth.UNAUTHORIZED();
  // Validate token and populate ctx.user
  return ctx;
};

const rateLimitMiddleware = async (ctx: TCtx): Promise<TCtx> => {
  // Check rate limits
  return ctx;
};

// Create router
export const router = new CtxRouter<TCtx>({
  serviceName: "user-service",
  logLevel: "standard",
});

// Health routes
router.route("GET /health/ping").to(async (ctx) => {
  ctx.res.data = { status: "ok" };
  return ctx;
});

// User routes with inherited middleware
const userRouter = router.route("user").via(rateLimitMiddleware, logMiddleware);

userRouter.route("GET /:userId").to(async (ctx) => {
  const userId = ctx.req.data.userId;
  // Fetch user from database
  ctx.res.data = { userId, name: "John Doe" };
  return ctx;
});

userRouter
  .route("POST /update")
  .via(authMiddleware)
  .to(async (ctx) => {
    const { userId, name } = ctx.req.data;
    // Update user in database
    ctx.res.data = { userId, name };
    return ctx;
  });

// Register error handler
router.hook.onExec.error(async (ctx, err) => {
  console.error(`[ERROR] ${ctx.id}:`, err);
  if (err instanceof AppErr) {
    ctx.res.code = err.name;
    ctx.res.msg = err.msg;
    ctx.res.data = err.data;
  } else {
    ctx.res.code = "UNKNOWN_ERROR";
    ctx.res.msg = "An unexpected error occurred";
  }
  ctx.err = err;
});
```

```typescript
// server.ts
import express from "express";
import { CtxAdapter } from "ctx-router";
import { router, TCtx } from "./router";

const app = express();
app.use(express.json());

app.use(async (req, res) => {
  const ctx: TCtx = router.newCtx();
  CtxAdapter.enrichFromExpress(ctx, req, res);
  await router.exec(ctx);

  const httpCode = ctx.res.code === "OK" ? 200 : 400;
  res.status(httpCode).json(ctx.res);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log(
    "Instance ID is available at ctx.meta.instance.id during request execution"
  );
});
```

## Design Principles

- **Transport-agnostic** - Business logic never depends on transport layer
- **Pattern-first routing** - Routes identified by patterns, not concrete values
- **Linear execution** - Predictable, sequential pipeline execution
- **No hidden behavior** - Explicit, boring, easy to trace
- **Type-safe by default** - Full TypeScript support
- **Framework independence** - Easy to integrate with any transport

## When to Use ctx-router

Use ctx-router if you:

- Share logic between HTTP endpoints and background jobs
- Want clean separation between transport and business logic
- Care about observability and routing identity
- Prefer explicit, predictable execution models
- Plan to support multiple transport layers

Don't use ctx-router if you want:

- Automatic dependency injection
- Controller/decorator-based routing
- Magic middleware behaviors
- Framework-specific optimizations

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/NeuronEnix/ctx-router).

## License

MIT © Kaushik R Bangera

## Links

- [GitHub Repository](https://github.com/NeuronEnix/ctx-router)
- [Issues](https://github.com/NeuronEnix/ctx-router/issues)
- [NPM Package](https://www.npmjs.com/package/ctx-router)

## OIDC Publishing

This package is published using GitHub Actions OIDC authentication.
