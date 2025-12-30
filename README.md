# ctx-router

[![npm version](https://img.shields.io/npm/v/ctx-router.svg)](https://www.npmjs.com/package/ctx-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Write your business logic once. Run it on Express, Fastify, Lambda, SQS, gRPC, or anything else.**

`ctx-router` is a framework-agnostic router that normalizes all transport layers (HTTP frameworks, serverless functions, event streams, gRPC) into a unified context. Your business logic stays the same regardless of how requests arrive.

## The Problem

Building modern applications often requires supporting multiple transport layers:

- Start with **Express**, then want to try **Fastify** or **Koa** → Need to rewrite handlers
- Deploy to **AWS Lambda** → Need to rewrite request/response handling
- Add **SQS** or **Kinesis** processing → Need different code for events vs HTTP
- Switch from **AWS** to **Google Cloud Functions** or **Azure Functions** → Vendor lock-in
- Support **gRPC** alongside **HTTP** → Maintain duplicate logic

Existing solutions only solve part of this:

- Framework adapters (serverless-express, etc.) only handle HTTP → Lambda
- NestJS supports multiple transports but requires heavy framework buy-in
- You end up with transport-specific code scattered everywhere

## The Solution

`ctx-router` sits between incoming requests and your business logic, providing:

**Without ctx-router:**

```
Express Handler → Your Logic
Lambda Handler → Rewritten Logic
SQS Handler → More Rewritten Logic
gRPC Handler → Even More Rewritten Logic
```

**With ctx-router:**

```
Express → toCtx.fromExpress() ┐
Lambda → toCtx.fromLambda()   ├→ Unified Context → Your Logic (once!)
SQS → toCtx.fromSQS()         │
gRPC → toCtx.fromGRPC()       ┘
```

### Key Benefits

- ✅ **Framework-agnostic**: Switch from Express to Fastify to Koa without touching business logic
- ✅ **Cloud-agnostic**: Same code works on AWS Lambda, Google Cloud Functions, Azure Functions
- ✅ **Multi-transport**: HTTP, events (SQS, Kinesis), gRPC, WebSockets all normalized
- ✅ **Lightweight**: Not a framework, just a routing layer (~10KB)
- ✅ **Type-safe**: Full TypeScript support with generic context types
- ✅ **Clean Architecture**: Separates transport concerns from business logic

## Installation

```bash
npm install ctx-router
```

Or using pnpm:

```bash
pnpm add ctx-router
```

## Quick Start

### 1. Define Your Router (Once)

**`router.ts`** - Your centralized, transport-agnostic router

```typescript
import { CtxRouter, TDefaultCtx } from "ctx-router";
import * as api from "./api";

// Extend the default context with your app's requirements
export type TCtx = TDefaultCtx & {
  user: {
    id: string;
    role: string[];
  };
};

// Create your router
export const router = new CtxRouter<TCtx>();

// Define routes once
router.handle("GET", "/health/ping", api.health.ping);
router.handle("POST", "/user/update", api.user.update);
router.handle("GET", "/user/:id", api.user.detail);

// Global error handler
router.onError(async (ctx, error) => {
  console.error("Route error:", error);
  ctx.res.code = "ERROR";
  ctx.res.msg = "Something went wrong";
  return ctx;
});
```

### 2. Write Your Business Logic (Once)

**`api/user/userUpdate.api.ts`** - Handler that works everywhere

```typescript
import { TCtx } from "../../router";

// Authentication - works regardless of transport
export async function auth(ctx: TCtx): Promise<TCtx> {
  // Your auth logic here (JWT validation, etc.)
  if (!ctx.user || !ctx.user.role.includes("USER")) {
    throw new Error("Unauthorized");
  }
  return ctx;
}

// Validation - transport-agnostic
export async function validate(ctx: TCtx): Promise<TReqData> {
  const data = ctx.req.data as TReqData;
  // Your validation logic
  return data;
}

// Business logic - pure, no transport concerns
export async function execute(reqData: TReqData): Promise<TResData> {
  return {
    userId: reqData.userId,
    userName: reqData.userName,
    updatedAt: new Date().toISOString(),
  };
}

type TReqData = { userId: string; userName: string };
type TResData = { userId: string; userName: string; updatedAt: string };
```

### 3. Connect Any Transport Layer

#### Express.js

**`express.ts`** - 10 lines to connect Express

```typescript
import express, { Request, Response } from "express";
import { toCtx } from "ctx-router";
import { router, TCtx } from "./router";

const app = express();
app.use(express.json());

function getHttpCode(ctx: TCtx) {
  if (ctx.res.code === "OK") return 200;
  if (ctx.res.code === "UNKNOWN_ERROR") return 500;
  return 400;
}

app.all("*", async (req: Request, res: Response) => {
  const ctx: TCtx = toCtx.fromExpress(req);
  await router.exec(ctx);
  res.status(getHttpCode(ctx)).json(ctx.res);
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

#### AWS Lambda

**`lambda.ts`** - Same business logic, different transport

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { toCtx } from "ctx-router";
import { router, TCtx } from "./router";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const ctx: TCtx = toCtx.fromLambda(event);
  await router.exec(ctx);

  return {
    statusCode: ctx.res.code === "OK" ? 200 : 400,
    body: JSON.stringify(ctx.res),
  };
};
```

#### AWS SQS

**`sqs.ts`** - Process events with the same handlers

```typescript
import { SQSEvent } from "aws-lambda";
import { toCtx } from "ctx-router";
import { router, TCtx } from "./router";

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const ctx: TCtx = toCtx.fromSQS(record);
    await router.exec(ctx);
    // Process result as needed
  }
};
```

#### Fastify (or Koa, Hapi, etc.)

**`fastify.ts`** - Switch frameworks without touching business logic

```typescript
import Fastify from "fastify";
import { toCtx } from "ctx-router";
import { router, TCtx } from "./router";

const fastify = Fastify();

fastify.all("*", async (request, reply) => {
  const ctx: TCtx = toCtx.fromFastify(request);
  await router.exec(ctx);
  reply.status(ctx.res.code === "OK" ? 200 : 400).send(ctx.res);
});

fastify.listen({ port: 3000 });
```

## Architecture

### Context Structure

The unified context (`TCtx`) contains everything your business logic needs:

```typescript
type TDefaultCtx = {
  req: {
    method: string; // GET, POST, etc.
    path: string; // /user/123
    query: Record<string, any>;
    params: Record<string, any>;
    headers: Record<string, any>;
    data: any; // Body/payload
  };
  res: {
    code: string; // OK, ERROR, etc.
    msg: string;
    data: any;
  };
  meta: {
    log: {
      stdout: string[];
    };
  };
  user: any; // Extend with your user type
};
```

### Handler Structure

Handlers follow a consistent pattern:

```typescript
export async function auth(ctx: TCtx): Promise<TCtx> {
  // Authenticate request, populate ctx.user
  return ctx;
}

export async function validate(ctx: TCtx): Promise<TReqData> {
  // Validate and transform ctx.req.data
  return validatedData;
}

export async function execute(reqData: TReqData): Promise<TResData> {
  // Pure business logic, no context needed
  return result;
}
```

## Advanced Features

### Custom Error Types

```typescript
import { ctxErrMap } from "ctx-router";

export const ctxErr = ctxErrMap({
  general: {
    UNKNOWN_ERROR: "Something went wrong",
    NOT_FOUND: "Resource not found",
  },
  auth: {
    UNAUTHORIZED: "Unauthorized",
    TOKEN_EXPIRED: "Token expired",
  },
});

// Use in handlers
throw ctxErr.auth.UNAUTHORIZED();
```

### Role-Based Authorization

```typescript
export const USER_ROLE = {
  USER: "USER",
  ADMIN: "ADMIN",
  SERVER: "SERVER",
} as const;

export type TCtx = TDefaultCtx & {
  user: {
    role: Array<keyof typeof USER_ROLE>;
  };
};

// In your handler
export async function auth(ctx: TCtx): Promise<TCtx> {
  const allowedRoles = [USER_ROLE.USER, USER_ROLE.ADMIN];
  if (ctx.user.role.some((r) => allowedRoles.includes(r))) return ctx;
  throw ctxErr.auth.UNAUTHORIZED();
}
```

## Use Cases

### Migrating Frameworks

Start with Express, migrate to Fastify later without rewriting business logic.

### Multi-Cloud Deployment

Deploy the same code to AWS Lambda, Google Cloud Functions, and Azure Functions.

### Hybrid Architecture

Serve HTTP requests via Express and process async jobs via SQS with the same handlers.

### Microservices

Support HTTP, gRPC, and message queues without duplicating logic.

### Testing

Write tests against the unified context without mocking framework-specific objects.

## API Reference

### CtxRouter

#### Constructor

```typescript
new CtxRouter<TCtx>()
```

#### Methods

- `handle(method: string, path: string, handler: IBaseApi<TCtx>)` - Register a route
- `exec(ctx: TCtx): Promise<TCtx>` - Execute a route
- `beforeExecHook(handler: (ctx: TCtx) => Promise<TCtx>)` - Set before execution hook
- `onErrorHook(handler: (ctx: TCtx, error: unknown) => Promise<TCtx>)` - Set error handler
- `onFinallyHook(handler: (ctx: TCtx) => Promise<TCtx>)` - Set finally hook

### Context Converters (toCtx)

- `toCtx.fromExpress(req: Request)` - Convert Express request
- `toCtx.fromLambda(event: APIGatewayProxyEvent)` - Convert Lambda event
- `toCtx.fromSQS(record: SQSRecord)` - Convert SQS record
- `toCtx.fromFastify(request: FastifyRequest)` - Convert Fastify request
- Custom converters can be created for any transport

## Examples

See the [`/src/example`](./src/example) directory for complete working examples.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT - Kaushik R Bangera

## Links

- [npm Package](https://www.npmjs.com/package/ctx-router)
- [GitHub Repository](https://github.com/NeuronEnix/ctx-router)
- [Issues](https://github.com/NeuronEnix/ctx-router/issues)
