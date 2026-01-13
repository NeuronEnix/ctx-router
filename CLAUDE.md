# CLAUDE.md

# Project rules

- use `const` always, unless absolutely necessary to use `let`

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`ctx-router` is a framework-agnostic router that normalizes all transport layers (HTTP frameworks, serverless functions, event streams, gRPC) into a unified context. The core principle is: write business logic once, run it on any transport layer (Express, Fastify, Lambda, SQS, gRPC, etc.).

## Development Commands

### Build and Run

```bash
pnpm build          # Compile TypeScript to dist/
pnpm dev            # Run the example Express server with hot reload
```

### Code Quality

```bash
pnpm lint           # Run ESLint with auto-fix
pnpm lint:staged    # Lint staged files (used in pre-commit hook)
pnpm format         # Format all source files with Prettier
pnpm format:staged  # Format staged files (used in pre-commit hook)
```

### Development Notes

- The dev server runs `src/example/express.ts` via nodemon with hot reload
- Husky is configured to run lint-staged on pre-commit
- The compiled output goes to `dist/` directory
- TypeScript is configured with strict mode enabled

## Architecture

### Core Components

**CtxRouter** (`src/router/router.ts`)

- Main router class that handles route registration and execution
- Uses `path-to-regexp` for pattern matching (supports dynamic params like `/user/:userId`)
- Provides dual lifecycle hook system: exec hooks (outer) and handler hooks (inner)
- Configurable log levels: `none`, `minimal`, `standard`, `verbose`
- Configurable stats collection: `statsEnabled` option to enable/disable CPU/memory telemetry

**TDefaultCtx** (`src/core/`)

- Unified context type that normalizes all transports
- Structure: `{ id, req, res, user, meta, err }`
- `req` contains: data, route, params, auth, client, invocation, transport
- `res` contains: code, msg, data, optional meta
- `meta` tracks: service info, instance metrics, timing, monitoring (traceId/spanId), logs
- Extend this type for your application's needs (e.g., custom user fields)

**Adapters** (`src/adapter/`)

- `enrichFromExpress()` - Enriches context with Express request data
- Adapters enrich an existing context created by `router.createCtx()`
- Additional adapters can be added for Lambda, gRPC, SQS, etc.
- Adapters extract method, path, headers, body, auth into unified format
- Adapters set protocol in transport, action/pattern/original in route

### Handler Pattern

All API handlers follow a consistent 3-function pattern:

```typescript
// 1. Authentication - validates permissions
export async function auth(ctx: TCtx): Promise<TCtx> {
  // Check user roles, populate ctx.user
  // Throw ctxErr if unauthorized
  return ctx;
}

// 2. Validation - extracts and validates request data
export async function validate(ctx: TCtx): Promise<TReqData> {
  // Validate ctx.req.data
  // Return typed request data
  return validatedData;
}

// 3. Business Logic - pure function, no transport concerns
export async function execute(reqData: TReqData): Promise<TResData> {
  // Pure business logic
  // No ctx dependency
  return result;
}
```

The router automatically chains these together. See `src/example/api/user/userUpdate.api.ts` for reference.

### Error Handling

**CtxError** (`src/ctx/ctx.err.ts`)

- Custom error class with structured format: `{ name, msg, data, info }`
- `name` is a constant (e.g., "UNAUTHORIZED")
- `msg` is human-readable
- `data` can be sent to client (non-sensitive)
- `info` is for internal logging only

**ctxErrMap**

- Factory function to create typed error maps
- Organizes errors by category (e.g., `auth`, `general`)
- Usage: `throw ctxErr.auth.UNAUTHORIZED()`
- Define your error map in your router file (see `src/example/router.ts`)

### Hook System

The router provides **dual lifecycle hooks** with nested try/catch structure:

**Exec Lifecycle (Outer)** - wraps routing + handler:

- `hookOnExecBefore`: Before routing (context prep, inject dependencies)
- `hookOnExecAfter`: After handler completes successfully (exec-level post-processing)
- `hookOnExecError`: On routing errors or bubbled handler errors (default: formats error response)
- `hookOnExecFinally`: Always runs (cleanup, telemetry)

**Handler Lifecycle (Inner)** - wraps user's business logic:

- `hookOnHandlerBefore`: Before user's handler executes (setup, begin transactions)
- `hookOnHandlerAfter`: After user's handler succeeds (commit transactions)
- `hookOnHandlerError`: On user's handler error only (rollback transactions)
- `hookOnHandlerFinally`: Always runs after handler (handler cleanup)

## Project Structure

```
src/
├── router/
│   ├── router.ts          # Main CtxRouter class
│   ├── types.ts           # Type definitions (THooks, LogLevel, Config)
│   ├── error.ts           # CtxError and ctxErrMap utilities
│   ├── lifecycle.exec.ts  # Exec lifecycle implementation
│   ├── instance.ts        # Router instance metrics
│   └── index.ts           # Router exports
├── core/
│   ├── index.ts           # Core type exports (TDefaultCtx, etc.)
│   ├── req.ts             # Request type definition
│   ├── res.ts             # Response type definition
│   ├── user.ts            # User type and roles
│   └── meta.ts            # Metadata type definition
├── adapter/
│   ├── express.v5.ts      # Express adapter (enrichFromExpress)
│   └── index.ts           # Adapter exports
├── common/
│   ├── const.ts           # Constants (STATS_INTERVAL_MS, STATS)
│   └── helper.ts          # Helper functions (updateStatsIfStale)
├── defaultHook/
│   ├── hook.onExecBefore.ts  # Default pre-execution hook
│   └── hook.onExecError.ts   # Default error handler
└── index.ts               # Main export file
```

## Implementation Guidelines

### Route Registration (Object-Based API)

All routes are registered using the object form:

```typescript
import { CtxRouter } from "ctx-router";

const router = new CtxRouter();

// HTTP routes
router.handle({
  protocol: "http",
  action: "GET", // HTTP method
  pattern: "/user/:id", // Path-only pattern
  handler: myHandler,
});

// Queue/Event routes
router.handle({
  protocol: "sqs",
  action: "order.created", // Event name
  pattern: "order.queue", // Queue/topic identifier
  handler: orderHandler,
});

// gRPC routes
router.handle({
  protocol: "grpc",
  action: "CreateUser", // gRPC method
  pattern: "/UserService", // Service path
  handler: grpcHandler,
});

// Wildcard action (matches any action for this protocol+pattern)
router.handle({
  protocol: "http",
  // action omitted = wildcard
  pattern: "/webhook",
  handler: webhookHandler,
});
```

**Key Concepts:**

- **protocol**: Transport identifier (http, grpc, sqs, kafka, etc.)
- **action** (optional): HTTP method, gRPC operation, event name, etc.
- **pattern**: Path or operation pattern (supports `:param` syntax)
- **Precedence**: Routes with specific actions take precedence over wildcards

### Configuring Telemetry

Control stats collection (CPU/memory metrics) via router config:

```typescript
// Disable stats collection (better performance, no telemetry)
const router = new CtxRouter({ statsEnabled: false });

// Enable stats collection (default behavior)
const router = new CtxRouter({ statsEnabled: true });

// Stats are updated lazily during traffic (no background interval)
// Frequency: every 5 seconds (STATS_INTERVAL_MS)
```

Use cases for disabling stats:

- Performance tuning (avoid `process.cpuUsage()` overhead)
- Compliance requirements (no telemetry in certain environments)
- Testing (deterministic behavior without metrics)

### Adding a New Transport Adapter

Create a new file in `src/adapter/` following the pattern:

```typescript
export function enrichFromYourTransport(
  ctx: TDefaultCtx,
  input: YourTransportType
): void {
  // Extract action and path/operation from input
  const action = extractAction(input); // e.g., method, event name, gRPC method
  const path = extractPath(input); // e.g., "/user/123", "order.queue"

  // Enrich ctx.req with request data
  ctx.req.data = extractData(input);
  ctx.req.route = {
    action, // Optional: HTTP method, event name, etc.
    pattern: path, // Will be reassigned by router after matching
    original: path, // Unchanged: concrete path/operation
  };

  // Optional: set auth, client, invocation fields
  if (hasAuth(input)) {
    ctx.req.auth = extractAuth(input);
  }

  // Set transport details with protocol
  ctx.req.transport = {
    protocol: "your-protocol", // Required: transport identifier
    request: {
      // Optional: protocol-specific details
    },
    raw: input,
  };
}
```

Export it from `src/index.ts` under the `adapter` namespace.

### Adding New Routes

1. Create API handler file with `auth`, `validate`, `execute` functions
2. Register in your router using object form:
   ```typescript
   router.handle({
     protocol: "http",
     action: "POST",
     pattern: "/user/:userId",
     handler: api.user.update,
   });
   ```
3. Path params (e.g., `/user/:userId`) are automatically extracted into `ctx.req.params`
4. Routes are matched by protocol first, then action (if specified), then pattern

### Role-Based Authorization

Use the `USER_ROLE` constant for role checking:

```typescript
const allowedRoles = [USER_ROLE.user, USER_ROLE.admin];
if (ctx.user.role.some((r) => allowedRoles.includes(r))) return ctx;
throw ctxErr.auth.UNAUTHORIZED();
```

### Logging and Telemetry Configuration

Control logging verbosity and stats collection when creating the router:

```typescript
// Log levels
new CtxRouter<TCtx>({ logLevel: "minimal" }); // Only method, path, traceId
new CtxRouter<TCtx>({ logLevel: "standard" }); // Essential info (default)
new CtxRouter<TCtx>({ logLevel: "verbose" }); // All request details
new CtxRouter<TCtx>({ logLevel: "none" }); // No logging

// Stats collection
new CtxRouter<TCtx>({ statsEnabled: true }); // Enable CPU/memory metrics (default)
new CtxRouter<TCtx>({ statsEnabled: false }); // Disable metrics for better performance

// Combined configuration
new CtxRouter<TCtx>({
  logLevel: "minimal",
  statsEnabled: false, // Optimal for high-throughput production
});
```

## Key Dependencies

- `path-to-regexp`: Route pattern matching
- `express`: Example HTTP framework integration
- `ts-node`: TypeScript execution for development
- `nodemon`: Hot reload during development

## TypeScript Configuration

- Target: ES2021
- Module: NodeNext (supports ESM)
- Strict mode enabled with comprehensive checks
- Decorators enabled (experimental)
- Output: `dist/` with declaration files and source maps
