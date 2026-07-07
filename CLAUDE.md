# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Project rules

- Use `const` always. Only use `let` when reassignment is genuinely required.
- The README (`README.md`) is the authoritative user-facing guide. This file covers what Claude needs to know about the repo internals and conventions; do not duplicate the README here.

## Project overview

`ctx-router` is a transport-agnostic router. It normalizes any ingress (HTTP, Lambda event, SQS message, gRPC call, …) into a single `ctx` object, then runs a linear pipeline of middleware + handler. Business logic only ever sees `ctx`, never a framework object.

The npm package itself only ships `src/`; everything else (`examples/`, `tests/`) is workspace-local.

## Repo layout

```
.
├── src/                          # Published package source (only this is in dist/)
│   ├── index.ts                  # Public API surface (namespaces below)
│   ├── router/
│   │   ├── router.ts             # CtxRouter class - newCtx(), exec(), route(), via(), hook
│   │   ├── builder.ts            # RouteBuilder - the .route().via().to() DSL
│   │   ├── lifecycle.exec.ts     # exec() impl: timing, route match, hook orchestration
│   │   ├── error.ts              # CtxBaseError, CtxRouterError, ctxErrMap, ctxRouterErr
│   │   ├── instance.ts           # Router instance state (id, seq, inflight)
│   │   ├── types.ts              # THooks, THookDSL, LogLevel, TCtxConsumerFn, CtxRouterConfig
│   │   └── index.ts
│   ├── core/
│   │   ├── index.ts              # TDefaultCtx, DEFAULT_USER_ROLE
│   │   ├── req.ts                # CtxReq (data, route, auth, caller, transport)
│   │   ├── res.ts                # CtxRes + CtxResMeta (CtxResMeta is opt-in for adapter envelopes)
│   │   ├── user.ts               # CtxUser (discriminated: kind "user" | "service")
│   │   └── meta.ts               # CtxMeta (serviceName, instance, ts, monitor, log)
│   ├── adapter/
│   │   ├── express.v5.ts         # enrichFromExpress(ctx, req, res)
│   │   └── index.ts              # (currently empty placeholder)
│   └── common/
│       ├── const.ts              # STATS, STATS_INTERVAL_MS
│       └── helper.ts             # Lazy process CPU/mem sampler (updateStatsIfStale, called from exec)
├── examples/
│   └── express/                  # pnpm workspace package: "ctx-router-example-express"
│       └── src/{server.ts,router.ts,api/**}
├── tests/                        # Vitest suite (not co-located)
│   ├── router.test.ts
│   ├── error.test.ts
│   └── adapter/express.v5.test.ts
├── feat.backlog.md               # Planned feature backlog - check before proposing big ideas
├── CHANGELOG.md                  # Maintained by release-please
└── release-please-config.json
```

## Development commands

```bash
pnpm build         # tsc -> dist/
pnpm build:clean   # Wipe dist/ first, then tsc
pnpm dev           # pnpm --filter ctx-router-example-express dev (nodemon on port 3001)
pnpm test          # vitest run
pnpm test:watch    # vitest watch
pnpm lint          # eslint --fix src
pnpm format        # prettier --write src
```

Notes:

- The example app is a workspace package; it imports `ctx-router` via `workspace:*` and is hot-reloaded by `nodemon`.
- Husky pre-commit runs `lint-staged` (prettier + eslint on staged files), then `pnpm build` and `pnpm test` — any failure aborts the commit.
- `pnpm prepublishOnly` runs `build:clean` + `test`; `prepack` runs `build:clean` only.
- `noEmitOnError: true` — TS errors fail the build.

## Public API surface

Everything exported from `src/index.ts`:

| Export                                | Kind  | Notes                                                                                     |
| ------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `CtxRouter`                           | class | The router. Generic over `TUserCtx extends TDefaultCtx`.                                  |
| `DEFAULT_USER_ROLE`                   | const | `{ none, user, admin, service }`                                                          |
| `CtxType.DefaultCtx`                  | type  | `TDefaultCtx`                                                                             |
| `CtxType.{Req,Res,ResMeta,User,Meta}` | type  | Core ctx member types (`CtxReq`, `CtxRes`, `CtxResMeta`, `CtxUser`, `CtxMeta`)            |
| `CtxType.CtxConsumerFn<T>`            | type  | `(ctx: T) => T \| Promise<T>` — middleware and handler shape                              |
| `CtxType.RouteBuilder<T>`             | type  | What `router.route(...)` returns                                                          |
| `CtxType.RouterError`                 | type  | Internal framework error class type                                                       |
| `CtxType.BaseError`                   | type  | Constructor-param shape (`{ name, msg, data?, info? }`) for extending `CtxErr.BaseError`  |
| `CtxErr.BaseError`                    | class | Extend this for your app errors. **Do not throw directly.**                               |
| `CtxErr.RouterError`                  | class | Internal framework error class. App code should not throw this.                           |
| `CtxErr.errMap`                       | fn    | `ctxErrMap(YourErrorClass, { category: { KEY: "msg" } })` — first arg is the error class. |
| `CtxAdapter.enrichFromExpress`        | fn    | `(ctx, req, res) => void` — mutates ctx in place.                                         |

There is no `router.handle({...}, fn)` API. Route registration is exclusively the `.route().via().to()` builder.

## Architecture

### The unified ctx (`TDefaultCtx`)

```
{
  id: string,                           // traceId, set during exec()
  req: {
    data: Record<string, unknown>,      // merged params + query + body (body wins on key collisions — see precedence note below)
    route: { op?, raw, pattern },       // op set by adapter, pattern set by router after match
    auth?, caller?,                     // optional ingress hints (auth + caller-provided identity/correlation)
    transport?: { protocol, framework?, request?, data?, network?, raw }
  },
  res: { code: string, msg: string, data: Record<string, unknown> },
  user: CtxUser,                        // discriminated union, see core/user.ts
  meta: CtxMeta,                        // mostly readonly; only ts.out and ts.execTime are writable
  locals: Record<string, unknown>,      // free-form request-scoped storage
  err: CtxBaseError | null
}
```

`CtxUser` is a discriminated union by `kind`:

- `{ kind: "user", role: ("none" | "user" | "admin")[], ... }`
- `{ kind: "service", role: ["service"], ... }`

`CtxMeta` is built in `newCtx()` with placeholder `-1` values, then filled in by `exec()`. `serviceName`, `instance`, `monitor`, and `log` are `readonly`; within `ts`, only `out` and `execTime` are writable (the rest of `ts` — `in`, `clientIn`, `ingressIn`, `owd` — are `readonly`). `exec()` works around this by replacing the whole `meta` object (and later the whole `ts` object) rather than mutating fields in place.

### Request flow

```
adapter creates request → router.newCtx()                # placeholder ctx (id="PENDING", ts=-1)
adapter enriches ctx     → CtxAdapter.enrichFromExpress  # populates req.{data,route,auth,…}
router.exec(ctx):
  └─ assign traceId, seq, inflight, timing; refresh process stats (updateStatsIfStale)
  └─ hook.onExec.before(ctx)
  └─ match route:
     ├─ exact map lookup (O(1)): try `op\0raw`, then op-less `raw` (wildcard)
     └─ otherwise iterate paramRoutes (sorted by specificity)
        └─ a matcher decode failure (malformed percent-encoding) disqualifies that
           route; if nothing else matches → MALFORMED_ROUTE_PATH (not HANDLER_NOT_FOUND)
  └─ merge matched :params into ctx.req.data (params have LOWEST priority)
  └─ run middleware chain → handler
  └─ hook.onExec.after(ctx)          # on success
  └─ catch → normalize error to CtxBaseError (non-CtxBaseError wrapped as UNKNOWN_ERROR
     with cause in info), assign to ctx.err, then:
     ├─ if error hook is registered: pre-fill ctx.res.{code,msg,data} from the
     │  normalized error (hook may override), call hook.onExec.error(ctx, originalErr),
     │  swallow, return ctx
     └─ if not registered: re-throw the original error (ctx.err stays set)
  └─ finally: set ts.out + execTime, decrement inflight, hook.onExec.finally(ctx)
```

Timing fields sourced from caller hints (`ts.clientIn`, `ts.ingressIn`, `ts.owd`) are `-1` when the hints are absent — never fake fallback values.

`ctx` is mutated in place throughout. Middleware and handlers must return the same `ctx` they received (returning a new object will work but is not the convention used in the codebase).

### Hooks (`router.hook.onExec.*`)

`before`, `after`, `error`, `finally`. Registered via fluent DSL. Hooks are **sealed on the first `exec()` call** — attempting to register after that throws `HOOKS_ALREADY_SEALED`. Register all hooks during startup.

`onExec.error` is the swallow-and-respond hook: if present, exec resolves normally and the adapter sees whatever response code the hook wrote into `ctx.res`. Without it, `exec()` re-throws (fail-fast).

### Logging

`LogLevel = "none" | "minimal" | "standard" | "verbose"`. Stored in the router but not yet wired to any output — it's a placeholder. Don't promise logging behavior from it.

### Process stats

`src/common/helper.ts` exposes `updateStatsIfStale(now)`, which `exec()` calls at the start of each request; it samples process CPU/mem at most once per `STATS_INTERVAL_MS` (5000ms). There is **no background timer and no import-time side effect** (so `"sideEffects": false` in package.json is accurate and nothing keeps the event loop alive in serverless runtimes). `ctx.meta.instance.cpu/mem` stay `-1` until the first `exec()` samples them.

## Route builder DSL — semantics that aren't obvious

```ts
router.route(...segments).via(...mws).to(handler);
router.via(...globalMws).route(...).to(handler);          // global mws scoped by builder
const userScope = router.route("/user").via(authMw);      // reusable child scope
userScope.route("GET /:id").to(api.user.detail);
```

Things to know:

- **Strict concatenation, no implicit delimiter.** `route("/user").route("/:id")` ⇒ `"/user/:id"`, but `route("user").route(":id")` ⇒ `"user:id"` (no `/` inserted). Choose your delimiter in the segment string.
- **HTTP grammar (strict).** A segment may be `pattern` (no whitespace), `METHOD` (method-only), or `METHOD pattern` (method token leading, single pattern token). Method tokens (`GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS`) are matched case-insensitively and normalized to an uppercase `op`. Any other whitespace shape throws `MALFORMED_SEGMENT` (so `route("/files delete")` is rejected, not registered as `DELETE /files`). A second method token anywhere in the chain throws `MULTIPLE_HTTP_METHODS`; a chain with only a method and no pattern throws `EMPTY_ROUTE_PATTERN`.
- **Duplicate registration throws.** Registering the same op + pattern twice throws `DUPLICATE_ROUTE` — no silent overwrite or shadowing.
- **Op-less routes are wildcards.** Routes registered without a method match any `op` (exact and param patterns alike); an op-specific exact route wins over an op-less one for the same raw. A request without an `op` only matches op-less routes.
- **Cartesian variant expansion.** `route("/user", "user").route("GET /:id", ".:id")` registers the handler under **all four** segment combinations. Use this when you want the same handler reachable via multiple syntaxes (e.g. slash form + dot form).
- **Builder is immutable.** Each `.route()` / `.via()` returns a new builder; the original is unaffected. Reuse safely.
- **`router.via(...)` returns a restricted scope** with only `route` and `via` exposed (no direct `.to()`) — you must `.route(...)` before terminating with `.to(handler)`.
- **Param precedence at runtime.** The Express adapter does `{ ...req.params, ...req.query, ...req.body }`, so for any key collision **body overrides query, and query overrides path params** (last spread wins — body is the highest-priority input). Then on match, the router does `{ ...matchedParams, ...ctx.req.data }`, so router-extracted `:params` have the _lowest_ priority — anything already in `ctx.req.data` with the same key wins. New adapters should follow the same priority for parity.
- **Pattern storage.** No-`:` patterns go into an exact `Map` keyed by `"op\0pattern"` (or plain `"pattern"` for op-less wildcard routes; `\0` is `EXACT_KEY_DELIMITER` in `router/types.ts`). Patterns with `:` are sorted by (more static chars > fewer params > longer pattern > lexical) and matched in order; specificity is computed once at registration and cached on the entry.

## Handler convention

The examples use a three-function module with a tiny composer in the parent index:

```ts
// examples/express/src/api/user/userUpdate.api.ts
export async function auth(ctx: TCtx): Promise<TCtx> { ... }            // returns ctx or throws
export async function validate(ctx: TCtx): Promise<TReqData> { ... }     // extracts typed input
export async function execute(req: TReqData): Promise<TResData> { ... }  // pure business logic
type TReqData = { ... };
type TResData = { ... };

// examples/express/src/api/user/index.ts
export async function update(ctx: TCtx) {
  const { auth, validate, execute } = userUpdate;
  ctx.res.data = await auth(ctx).then(validate).then(execute);
  return ctx;
}

// router wiring
router.route("POST /user/update").to(api.user.update);
```

`execute` takes no `ctx` — that's the whole point: business logic stays transport-free.

There is no framework-level enforcement of this shape; it's a convention. If you add or modify handlers, follow it.

## Error model

```ts
class AppErr extends CtxErr.BaseError {
  constructor(e: CtxType.BaseError) {
    super(e);
  }
}

export const appErr = CtxErr.errMap(AppErr, {
  auth: { UNAUTHORIZED: "Unauthorized", TOKEN_EXPIRED: "Token expired" },
  general: { UNKNOWN_ERROR: "Something went wrong" },
});

throw appErr.auth.UNAUTHORIZED();
throw appErr.auth.UNAUTHORIZED({ data: { userId }, info: { ip } });
```

- `CtxBaseError` instances expose `{ name, message, data, info, stack }`.
- `data` is client-safe (intended to be sent in `ctx.res.data`); `info` is server-side-only debugging context.
- `CtxRouterError` is internal (thrown via `ctxRouterErr` for framework conditions like `HANDLER_NOT_FOUND`, `MALFORMED_ROUTE_PATH`, `HOOKS_ALREADY_SEALED`, `DUPLICATE_ROUTE`, `MULTIPLE_HTTP_METHODS`, `MALFORMED_SEGMENT`, etc.). Distinguish in your error hook with `instanceof` if you want different handling (e.g. map `HANDLER_NOT_FOUND` to 404).
- `exec()` normalizes every caught error to a `CtxBaseError` (wrapping non-`CtxBaseError` values as `UNKNOWN_ERROR`), assigns it to `ctx.err`, and — when an error hook is registered — pre-fills `ctx.res.{code,msg,data}` from it before the hook runs.

## Adding a new transport adapter

Adapter contract: take whatever the platform hands you, mutate the provided `ctx` in place.

Required:

- `ctx.req.data` — merge inputs (params/query/body or their equivalents) into one object. Adopt **body > query > params** priority (body wins on key collisions) for parity with the Express adapter — i.e. spread as `{ ...params, ...query, ...body }`.
- `ctx.req.route` — set `op` (HTTP method, event name, gRPC method, …) and `raw` (concrete path/key/topic). Leave `pattern` as `"PENDING"` — the router rewrites it after matching.
- `ctx.req.transport` — set `protocol` (always) plus any of `framework`, `request`, `data` (per-transport input like headers, queue/topic/partition, etc.), `network`, `raw`. Stash the platform's native object(s) in `raw` so userland code can escape-hatch when needed.

Optional:

- `ctx.req.auth` — extract any standard credentials you can.
- `ctx.req.caller` — extract caller-provided identity (appVersion, apiVersion, sessionId, deviceId) and per-call correlation (traceId, spanId, seq, ts, ingressIn, traceparent) hints. Numeric hints (`ts`, `ingressIn`, `seq`) are epoch-ms / plain numbers parsed strictly with `Number()` — malformed values are dropped, never truncated.

Reference: `src/adapter/express.v5.ts` (note: its signature is `(ctx, req, res)` because it stashes the response object in `transport.raw` for downstream use). Export new adapters from `src/index.ts` under the `CtxAdapter` namespace.

## TypeScript config (notes that affect edits)

- `target: ES2021`, `module/moduleResolution: NodeNext`, ESM-aware. `"sideEffects": false` is set in `package.json` and is accurate — no module in `src/` has import-time side effects; keep it that way.
- `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`. Optional properties must be conditionally assigned (see how `enrichFromExpress` only assigns `auth`/`client`/`caller` when non-empty).
- `experimentalDecorators` + `emitDecoratorMetadata` are on, but not currently used in `src/`.

## Tests

Vitest, top-level `tests/`. Tests import directly from `src/` (not from `dist/`). When changing public API or builder semantics, update or add tests under `tests/`.

## When in doubt

- Behavior questions: prefer running `pnpm test` or reading the relevant test file over guessing.
- User-facing API examples: `README.md` is canonical.
- Real-world wiring: `examples/express/src/` is the working reference (server, router setup, handler convention).
- Roadmap / planned features: check `feat.backlog.md` before proposing speculative API changes.
