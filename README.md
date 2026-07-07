# ctx-router

[![npm version](https://img.shields.io/npm/v/ctx-router.svg)](https://www.npmjs.com/package/ctx-router)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A transport-agnostic router that normalizes every ingress — HTTP, Lambda, SQS, gRPC, anything — into a single `ctx` object and runs your business logic as a linear pipeline.

Write your handlers once. Run them on Express today, Lambda tomorrow, without touching a line of business code.

## Why ctx-router?

Apps usually start with HTTP, then grow background jobs, async workers, serverless triggers. The same business logic ends up duplicated across each transport, glued together with framework-specific objects.

**The problem isn't routing — it's transport leakage into business logic.**

`ctx-router` normalizes all ingress into one `ctx`, routes by pattern (not framework), and runs middleware + handler as a linear pipeline. Transport concerns stay at the boundaries.

## Installation

```bash
npm install ctx-router
```

## Quick Start

### 1. Define your router

```typescript
// router.ts
import { CtxRouter, CtxType, CtxErr } from "ctx-router";

export type TCtx = CtxType.DefaultCtx & {
  user: { role: ("user" | "admin")[] };
};

class AppErr extends CtxErr.BaseError {
  constructor(e: CtxType.BaseError) {
    super(e);
  }
}

export const appErr = CtxErr.errMap(AppErr, {
  auth: { UNAUTHORIZED: "Unauthorized" },
  general: { UNKNOWN_ERROR: "Something went wrong" },
});

export const router = new CtxRouter<TCtx>({ serviceName: "my-service" });
```

### 2. Register routes

```typescript
// HTTP grammar is auto-detected
router.route("GET /health").to(api.health.ping);

// Middleware chain
router.route("POST /user/update").via(auth, validate).to(api.user.update);

// Scoped builder with shared middleware
const userScope = router.route("/user").via(authMiddleware);
userScope.route("GET /:userId").to(api.user.detail);
```

### 3. Write a handler

```typescript
// api/user/userUpdate.ts
export async function update(ctx: TCtx): Promise<TCtx> {
  const { userId, name } = ctx.req.data;
  // Business logic — no Express, no Lambda, just ctx
  ctx.res.data = { userId, name };
  return ctx;
}
```

### 4. Wire up Express

```typescript
// server.ts
import express from "express";
import { CtxAdapter } from "ctx-router";
import { router } from "./router";

const app = express();
app.use(express.json());

app.use(async (req, res) => {
  const ctx = router.newCtx();
  CtxAdapter.enrichFromExpress(ctx, req, res);
  await router.exec(ctx);
  res.status(ctx.res.code === "OK" ? 200 : 400).json(ctx.res);
});

app.listen(3000);
```

## The Context

`CtxType.DefaultCtx` is the single object that flows through your system:

```typescript
type DefaultCtx = {
  id: string; // traceId, set during exec()
  req: CtxReq; // route, data, auth, caller, transport
  res: CtxRes; // { code, msg, data }
  user: CtxUser; // discriminated union (user | service)
  meta: CtxMeta; // service, instance, timing, monitor
  locals: Record<string, unknown>;
  err: CtxErr.BaseError | null;
};
```

`ctx.req.data` is the unified input payload — the adapter merges path params, query, and body into it. On key collisions **body wins**, then query, then path params.

Extend `DefaultCtx` for app-specific fields:

```typescript
export type TCtx = CtxType.DefaultCtx & {
  user: { role: ("user" | "admin")[] };
  locals: { db?: DatabaseConnection };
};
```

Full type definitions live in [`src/core/`](./src/core).

## Route builder

Routes are built via an immutable fluent DSL: `route()` → `via()` → `to()`.

```typescript
router.route(segment).via(mw1, mw2).to(handler);
```

**HTTP grammar auto-detection.** Whitespace-split each segment; tokens case-insensitively matching `GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS` become the route's `op` (only the first method token is kept), the rest is the pattern.

```typescript
router.route("GET /user/:id"); // op: "GET", pattern: "/user/:id"
```

**Strict concatenation & variants.** Chained `route()` calls concatenate segments exactly as written — no implicit `/`. Passing multiple segments to one `route()` call registers the handler under every combination (cartesian product across chained calls).

```typescript
router.route("/user").route("/:id"); // pattern "/user/:id"
router.route("user.").route(":id"); // pattern "user.:id" — no "/" inserted
router.route("/user", "user").route("/:id", ".:id"); // all 4 combinations
```

**Scoped builders.** Each `.route()`/`.via()` returns a new builder — reuse parents to share middleware.

```typescript
const userScope = router.route("/user").via(authMw);
userScope.route("GET /:id").to(api.user.detail);
userScope.route("POST /update").to(api.user.update);
```

**Global middleware.** `router.via(...)` returns a restricted scope (`route`/`via` only — no `.to()`) so middleware can be applied before any route definition.

```typescript
router.via(logMw, metricsMw).route("GET /health").to(api.health.ping);
```

**Path parameters.** Patterns with `:param` are matched via `path-to-regexp`; extracted params are merged into `ctx.req.data` with the lowest priority (anything in body/query wins).

```typescript
router.route("GET /user/:userId/post/:postId").to(async (ctx) => {
  // ctx.req.data.userId, ctx.req.data.postId
  return ctx;
});
```

## Lifecycle hooks

```typescript
router.hook.onExec.before(async (ctx) => {
  /* setup, tracing */
});
router.hook.onExec.after(async (ctx) => {
  /* metrics on success */
});
router.hook.onExec.error(async (ctx, err) => {
  /* shape the error response */
});
router.hook.onExec.finally(async (ctx) => {
  /* always runs */
});
```

Execution order: `before` → route match → middleware → handler → `after` (or `error`) → `finally`.

Hooks are **sealed on the first `exec()` call** — register them during startup.

If `onExec.error` is registered, exec swallows the error and returns ctx (your hook writes the response). Without it, exec re-throws (fail-fast).

## Error handling

Define an app error class and a structured error map:

```typescript
class AppErr extends CtxErr.BaseError {
  constructor(e: CtxType.BaseError) {
    super(e);
  }
}

export const appErr = CtxErr.errMap(AppErr, {
  auth: { UNAUTHORIZED: "Unauthorized", TOKEN_EXPIRED: "Token expired" },
  user: { NOT_FOUND: "User not found" },
});

// In a handler
throw appErr.auth.UNAUTHORIZED();
throw appErr.user.NOT_FOUND({
  data: { userId }, // client-safe
  info: { stack }, // server-only
});
```

`CtxErr.BaseError` instances expose `{ name, message, data, info, stack }` — the constructor takes `msg`, which becomes the standard `Error#message`. `data` is intended for `ctx.res.data`; `info` stays server-side.

Shape the response in the error hook:

```typescript
router.hook.onExec.error(async (ctx, err) => {
  if (err instanceof AppErr) {
    ctx.res.code = err.name;
    ctx.res.msg = err.message;
    ctx.res.data = err.data;
  } else {
    ctx.res.code = "UNKNOWN_ERROR";
    ctx.res.msg = "An unexpected error occurred";
  }
  ctx.err = err;
});
```

## Express adapter

```typescript
import { CtxAdapter } from "ctx-router";
CtxAdapter.enrichFromExpress(ctx, req, res);
```

The adapter populates `ctx.req` from the Express request:

- **`data`** — merged `params + query + body` (body wins on collisions)
- **`route`** — `op: req.method`, `raw: req.path`
- **`auth`** — `Authorization: Bearer …` (→ `bearerToken`) or `Authorization: Basic …` (→ `clientId`/`clientSecret`); API key from `x-ctx-api-key` / `x-api-key` / `apikey` (first match); `x-ctx-refresh-token`
- **`caller`** — identity (`x-ctx-app-version`, `x-ctx-api-version`, `x-ctx-session-id`, `x-ctx-device-id`) plus correlation hints (`x-ctx-trace-id`, `x-ctx-seq`, `x-ctx-client-ts`, `x-ctx-ingress-in`)
- **`transport`** — `protocol: "http"`, `framework: "express"`, `request: { method, path }`, headers copied into `transport.data.headers`, client IP/hops in `network`, native `req`/`res` stashed in `raw`

## Adding a new transport

Adapters take whatever the platform hands you and mutate `ctx` in place. At minimum:

- Set `ctx.req.data` (merged input, body-wins priority).
- Set `ctx.req.route.op` and `ctx.req.route.raw`. Leave `pattern` as `"PENDING"` — the router rewrites it after matching.
- Set `ctx.req.transport.protocol` and stash the native object(s) in `transport.raw`.

See [`src/adapter/express.v5.ts`](./src/adapter/express.v5.ts) as a reference.

## API surface

| Export                         | Notes                                                  |
| ------------------------------ | ------------------------------------------------------ |
| `CtxRouter`                    | Generic over `TUserCtx extends TDefaultCtx`            |
| `DEFAULT_USER_ROLE`            | `{ none, user, admin, service }`                       |
| `CtxType.*`                    | `DefaultCtx`, `CtxConsumerFn<T>`, `RouteBuilder<T>`, … |
| `CtxErr.BaseError`             | Extend this for your app errors                        |
| `CtxErr.errMap`                | Build a typed, category-organized error factory        |
| `CtxAdapter.enrichFromExpress` | `(ctx, req, res) => void`, mutates in place            |

`CtxRouter` methods: `newCtx(protocol?)`, `exec(ctx)`, `route(...segments)`, `via(...mws)`, plus the `hook` DSL.

## Contributing

Open an issue or pull request on [GitHub](https://github.com/NeuronEnix/ctx-router).

## License

MIT © Kaushik R Bangera
