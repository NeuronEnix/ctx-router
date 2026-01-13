# Refactor Plan (ctx-router)

## Purpose

This document captures the full refactor intent, rationale, and implementation details. It is written for a future implementer to execute changes without re-deriving design intent.

## Design Principles

- Router stays transport-agnostic and only requires a minimal context contract.
- Context is user-extendable; defaults must not block custom fields.
- Adapters are optional batteries, not core.
- Lifecycle must be safe by default and hard to misuse.
- Routing conventions should be consistent and compatible with the current matcher.

## Current Pain Points

- Manual `begin()` and `end()` are easy to forget and lead to inflight leaks and inconsistent metrics.
- Adapter mutates `meta.ts` directly, which makes lifecycle timing harder to reason about.
- Proposed routing prefixes like `http:GET` will conflict with `path-to-regexp` because `:` indicates params.
- `setInterval` stats start at import time and can keep serverless runtimes alive.
- Hook typing loses extended context types once hooks are stored.
- Router merges route params into `ctx.req.data`, which forces a data policy in the core.

## Minimum Context Contract (Router Assumptions)

The router only relies on the following fields; everything else can be extended by users.

- `ctx.req.routeValue` is the concrete string to match.
- `ctx.req.route` is set by the router to the matched pattern.
- `ctx.req.data` is an object; router will not mutate it.
- `ctx.res` exists and can be written to.
- `ctx.meta` exists to carry timing and trace fields; router owns the core timing values.

## Change Set

### 1) Lifecycle consolidation: `createCtx()` + `exec()`

Why: Users frequently forget `end()`, which breaks inflight counters and response metadata. The router should own lifecycle bookkeeping.

What changes:

- Public API becomes `createCtx()` (new) and `exec(ctx)` (existing).
- `exec()` will perform begin and end logic internally.
- `begin()` and `end()` are removed (breaking change is OK).

Implementation detail:

1. Add `createCtx()` on `CtxRouter` that returns a default context without inflight side effects.
2. Move "begin" logic into the top of `exec()` (set trace id, seq, instance stats, meta.ts.in).
3. Move "end" logic into the `finally` block of `exec()` (set out, execTime, response meta, decrement inflight).
4. Always increment inflight at the top of `exec()` and always decrement in `finally`.
   - No guard needed if `exec()` is the only place that touches inflight.

Acceptance criteria:

- `exec()` always sets `ctx.res.meta` and decrements inflight exactly once.
- `exec()` sets timing fields even if handler throws.
- No caller needs to invoke `end()` for correct metrics.

### 2) Adapter contract: move timestamp handling into `exec()`

Why: Adapters should only enrich `ctx.req` with transport data. Timing and trace are lifecycle concerns and should be centralized.

What changes:

- Adapters set `ctx.req.invocation.ts` if they receive client timestamps.
- Adapters do not mutate `ctx.meta.ts`.
- `exec()` computes `meta.ts.in`, `meta.ts.clientIn`, and `meta.ts.owd` using `req.invocation.ts` if present.

Acceptance criteria:

- Existing Express adapter updated so `x-ctx-ts` flows into `req.invocation.ts`.
- `meta.ts` values are consistent and set in one place.

### 3) Routing convention

Deferred to Phase 2.

### 4) Hook typing: preserve extended context types

Why: Storing hooks in a non-generic `THooks` drops type safety for extended contexts.

What changes:

- Make `THooks<TContext>` generic.
- `CtxRouter<TContext>` stores `hooks: THooks<TContext>`.
- Hook setter methods accept handlers typed to `TContext`.

Acceptance criteria:

- TypeScript preserves extended context fields inside hooks.

### 5) Telemetry: serverless-safe stats collection

Why: `setInterval` at import time can keep serverless runtimes alive and inflate costs.

What changes:

- Replace auto-start with a lazy, on-demand updater.
- Add a small helper that checks `Date.now()` against a next-update timestamp.
- Call the helper from `exec()` so stats update only when requests flow.
- Use a hard-coded 5s interval stored as a constant.

Suggested helper behavior:

- Keep `lastStatsAt` and `nextStatsAt` in module scope.
- If `Date.now()` >= `nextStatsAt`, compute stats and set `nextStatsAt = now + STATS_INTERVAL_MS`.
- Set `STATS_INTERVAL_MS = 5000` in the constants module.

Acceptance criteria:

- No background interval starts just from importing the package.
- Stats update only during traffic.

### 6) Data policy: router must not merge into `ctx.req.data`

Why: The router should be transport-agnostic and not force a data merging policy.

What changes:

- Remove `ctx.req.data = { ...ctx.req.data, ...match.params }` from `exec()`.
- Adapters or user code are responsible for merging body/query/params into `ctx.req.data`.

Where to put matched params:

- Add an optional field `ctx.req.params?: Record<string, string>` and set it from `match.params`.
- This keeps params available without changing `ctx.req.data`.

Acceptance criteria:

- `ctx.req.data` is not mutated by the router.
- Matched params are still accessible in a dedicated field.

## Implementation Steps (Concrete)

1. Add `createCtx()` in `src/router/router.ts`.
2. Move begin logic into `src/router/lifecycle.exec.ts` before hooks run.
3. Move end logic into `src/router/lifecycle.exec.ts` finally block.
4. Update `src/adapter/express.v5.ts` to stop mutating `meta.ts`; set `req.invocation.ts` instead.
5. Make `THooks` generic in `src/router/types.ts` and update uses.
6. Replace `setInterval` with a lazy stats updater in `src/common/helper.ts`.
7. Remove router-side merge into `ctx.req.data` and add `ctx.req.params`.
8. Update tests in `tests/router.test.ts` and `tests/adapter/express.v5.test.ts` for new lifecycle and data policy.
9. Update examples to remove explicit `end()`.

## File Map (Where to Change)

- `src/router/router.ts` add `createCtx()`, update hook storage typing.
- `src/router/lifecycle.exec.ts` integrate begin and end logic with guards.
- `src/router/lifecycle.begin.ts` and `src/router/lifecycle.end.ts` remove or convert to internal helpers.
- `src/router/types.ts` make `THooks` generic.
- `src/adapter/express.v5.ts` adjust timestamp handling.
- `src/common/helper.ts` remove interval, add `updateStatsIfStale()` helper.
- `src/core/req.ts` add `params?: Record<string, string>`.
- `tests/router.test.ts` remove `end()` usage and assert meta set after `exec()`.
- `tests/adapter/express.v5.test.ts` assert `req.invocation.ts` handling instead of `meta.ts`.
- `examples/express/src/server.ts` remove explicit `end()` if lifecycle is internal.

## Migration Notes for Users

- New recommended flow: `ctx = router.createCtx()` -> adapter enriches ctx -> `router.exec(ctx)` -> respond.
- `begin()` / `end()` are removed as part of the breaking change.
- Adapters must handle data merging (body/query/params) and set `ctx.req.data`.
- If users keep old `GET /path` route patterns, it will still work for HTTP.

## Open Decisions

None for Phase 1.
