# CLAUDE.md

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

**CtxRouter** (`src/ctx/ctx.router.ts`)

- Main router class that handles route registration and execution
- Uses `path-to-regexp` for pattern matching (supports dynamic params like `/user/:userId`)
- Provides hook system: `beforeExec`, `afterExec`, `execError`, `execFinally`
- Configurable log levels: `none`, `minimal`, `standard`, `verbose`

**TDefaultCtx** (`src/ctx/ctx.types.ts`)

- Unified context type that normalizes all transports
- Structure: `{ id, req, res, user, meta }`
- `req` contains: method, path, data, headers, ip
- `res` contains: code, msg, data, optional meta
- `meta` tracks: service info, timing, monitoring (traceId/spanId), logs
- Extend this type for your application's needs (e.g., custom user fields)

**Context Converters** (`src/transform/`)

- `toCtx.fromExpress()` - Converts Express Request to TDefaultCtx
- Additional converters can be added following the same pattern
- Converters extract method, path, headers, body into unified format

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

The router provides lifecycle hooks:

- `hookBeforeExec`: Called before route execution (default logs request info)
- `hookAfterExec`: Called after successful execution
- `hookExecError`: Called on any error (default sets error response)
- `hookExecFinally`: Called after execution completes (success or failure)

## Project Structure

```
src/
├── ctx/
│   ├── ctx.router.ts      # Main CtxRouter class
│   ├── ctx.types.ts       # TDefaultCtx and USER_ROLE definitions
│   └── ctx.err.ts         # CtxError and ctxErrMap utilities
├── transform/
│   ├── fromExpress.ts     # Express → Context converter
│   └── index.ts           # Transform utilities and exports
├── defaultHandler/
│   ├── handle.beforeExec.ts  # Default pre-execution hook
│   └── handle.onError.ts     # Default error handler
├── example/
│   ├── router.ts          # Example router configuration
│   ├── express.ts         # Example Express integration
│   └── api/               # Example API handlers
│       ├── health/        # Health check endpoints
│       └── user/          # User endpoints (update, detail)
└── index.ts               # Main export file
```

## Implementation Guidelines

### Adding a New Transport Converter

Create a new file in `src/transform/` following the pattern:

```typescript
export function transformFromYourTransport(
  input: YourTransportType
): TDefaultCtx {
  return {
    id: generateId(),
    req: {
      method: extractMethod(input),
      path: extractPath(input),
      data: extractBody(input),
      header: extractHeaders(input),
      ip: extractIp(input),
      ips: [],
    },
    // ... rest of context
  };
}
```

Export it from `src/index.ts` under the `toCtx` namespace.

### Adding New Routes

1. Create API handler file with `auth`, `validate`, `execute` functions
2. Register in your router: `router.handle("METHOD", "/path", handler)`
3. Path params (e.g., `/user/:userId`) are automatically merged into `ctx.req.data`

### Role-Based Authorization

Use the `USER_ROLE` constant for role checking:

```typescript
const allowedRoles = [USER_ROLE.user, USER_ROLE.admin];
if (ctx.user.role.some((r) => allowedRoles.includes(r))) return ctx;
throw ctxErr.auth.UNAUTHORIZED();
```

### Logging Configuration

Control logging verbosity when creating the router:

```typescript
new CtxRouter<TCtx>({ logLevel: "minimal" }); // Only method, path, traceId
new CtxRouter<TCtx>({ logLevel: "standard" }); // Essential info (default)
new CtxRouter<TCtx>({ logLevel: "verbose" }); // All request details
new CtxRouter<TCtx>({ logLevel: "none" }); // No logging
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
