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

**HTTP grammar (strict).** A segment is either a `pattern` (no whitespace), a bare `METHOD`, or `"METHOD pattern"` — the method token must come first and is matched case-insensitively (`get /user` ⇒ op `GET`). Anything else throws at registration: a non-leading method token or extra whitespace throws `MALFORMED_SEGMENT`, and declaring two methods in one chain throws `MULTIPLE_HTTP_METHODS`.

```typescript
router.route("GET /user/:id"); // op: "GET", pattern: "/user/:id"
router.route("/files delete"); // throws MALFORMED_SEGMENT
```

**Wildcards & duplicates.** Routes registered without a method match any `op`; an op-specific route wins over the wildcard for the same path. Registering the same op + pattern twice throws `DUPLICATE_ROUTE`.

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

**Path parameters.** Patterns with `:param` are matched via `path-to-regexp`; extracted params are merged into `ctx.req.data` with the lowest priority (anything in body/query wins). A request path whose percent-encoding can't be decoded fails with `MALFORMED_ROUTE_PATH` (a `CtxErr.RouterError`) instead of a generic not-found.

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

Every caught error is normalized to a `CtxErr.BaseError` (unknown values are wrapped as `UNKNOWN_ERROR`) and set on `ctx.err`. If `onExec.error` is registered, exec pre-fills `ctx.res.{code,msg,data}` from the error, runs your hook (which may override the response), swallows the error, and returns ctx. Without the hook, exec re-throws (fail-fast) — `ctx.err` is still set.

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

Shape the response in the error hook. `ctx.err` is already set and `ctx.res.{code,msg,data}` are pre-filled from the error, so you only override what you need:

```typescript
router.hook.onExec.error(async (ctx, err) => {
  // Framework errors are CtxErr.RouterError — e.g. map not-found to your own code
  if (err instanceof CtxErr.RouterError && err.name === "HANDLER_NOT_FOUND") {
    ctx.res.code = "NOT_FOUND";
    ctx.res.msg = "Route not found";
  }
});
```

Your adapter can then map `ctx.res.code` to a transport status (`NOT_FOUND` → 404, `MALFORMED_ROUTE_PATH` → 400, …).

## Express adapter

```typescript
import { CtxAdapter } from "ctx-router";
CtxAdapter.enrichFromExpress(ctx, req, res);
```

The adapter populates `ctx.req` from the Express request:

- **`data`** — merged `params + query + body` (body wins on collisions)
- **`route`** — `op: req.method`, `raw: req.path`
- **`auth`** — `Authorization: Bearer …` (→ `bearerToken`) or `Authorization: Basic …` (→ `clientId`/`clientSecret`); API key from `x-ctx-api-key` / `x-api-key` / `apikey` (first match); `x-ctx-refresh-token`
- **`caller`** — identity (`x-ctx-app-version`, `x-ctx-api-version`, `x-ctx-session-id`, `x-ctx-device-id`) plus correlation hints (`x-ctx-trace-id`, `x-ctx-span-id`, `traceparent`, `x-ctx-seq`, `x-ctx-client-ts`, `x-ctx-ingress-in`). Numeric headers (`x-ctx-client-ts`, `x-ctx-ingress-in`, `x-ctx-seq`) are epoch-ms / plain numbers — non-numeric values are dropped.
- **`transport`** — `protocol: "http"`, `framework: "express"`, `request: { method, path }`, headers copied into `transport.data.headers`, client IP/hops in `network`, native `req`/`res` stashed in `raw`

## Adding a new transport

Adapters take whatever the platform hands you and mutate `ctx` in place. At minimum:

- Set `ctx.req.data` (merged input, body-wins priority).
- Set `ctx.req.route.op` and `ctx.req.route.raw`. Leave `pattern` as `"PENDING"` — the router rewrites it after matching.
- Set `ctx.req.transport.protocol` and stash the native object(s) in `transport.raw`.

See [`src/adapter/express.v5.ts`](./src/adapter/express.v5.ts) as a reference.

## API surface

| Export                         | Notes                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `CtxRouter`                    | Generic over `TUserCtx extends TDefaultCtx`                                                     |
| `DEFAULT_USER_ROLE`            | `{ none, user, admin, service }`                                                                |
| `CtxType.*`                    | `DefaultCtx`, `Req`, `Res`, `ResMeta`, `User`, `Meta`, `CtxConsumerFn<T>`, `RouteBuilder<T>`, … |
| `CtxErr.BaseError`             | Extend this for your app errors                                                                 |
| `CtxErr.errMap`                | Build a typed, category-organized error factory                                                 |
| `CtxAdapter.enrichFromExpress` | `(ctx, req, res) => void`, mutates in place                                                     |

`CtxRouter` methods: `newCtx(protocol?)`, `exec(ctx)`, `route(...segments)`, `via(...mws)`, plus the `hook` DSL.

## Contributing

Open an issue or pull request on [GitHub](https://github.com/NeuronEnix/ctx-router).

## License

MIT © Kaushik R Bangera
