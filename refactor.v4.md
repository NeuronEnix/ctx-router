# Refactor Phase 4 (Breaking)

## Status Table

| task                      | what it does                                                                                    | status                                 | ask test                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| Define new route contract | Move protocol back to transport, route -> `{ action?, pattern, original }`, remove `routeValue` | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Object-only route API     | `router.handle` accepts only `{ protocol, action?, pattern, handler }` with runtime validation  | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Matching rules            | Define action-required rules, wildcard behavior, and precedence                                 | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Adapter updates           | Express adapter sets protocol in transport and action in route                                  | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Hooks/logging             | Log path-only pattern/original, method from action if needed                                    | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Tests                     | Update router/adapter tests, add protocol/action edge cases                                     | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Examples                  | Update example routes to object form                                                            | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Route utils audit         | Remove or refactor buildRoute/parseRoute/isCanonicalRoute if unused                             | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |
| Performance note          | Confirm no indexing/caching changes required now                                                | <span style="color:red">PENDING</span> | <span style="color:red">x</span> |

Legend:

- status: <span style="color:red">PENDING</span> | <span style="color:orange">ONGOING</span> | <span style="color:green">COMPLETED</span>
- ask test: <span style="color:red">x</span> (not asked) | <span style="color:orange">o</span> (in progress) | <span style="color:green">o</span> (done)

## Scope Notes

- This is a breaking change for a package that is not published/used yet.
- No deprecation window, migration guide, changelog entry, or extra docs are required.
- Examples and tests must be updated.

## Why This Change

Object-only route registration avoids delimiter/spacing issues, keeps log queries clean (path-only), and still preserves HTTP methods via optional `action`.

## Current State Summary

- `router.handle(route: string, handler)` registers string routes (e.g., "GET /path").
- `ctx.req.route` currently includes `{ protocol, action, pattern, original }`.
- `ctx.req.transport.protocol` was removed and is now duplicated in `ctx.req.route.protocol`.
- Express adapter writes `ctx.req.route` and sets protocol there.
- Router matching uses `ctx.req.route.original` and replaces `ctx.req.route.pattern` after match.
- Tests and examples rely on the string route API and method+path patterns.

## Target Contract

- `ctx.req.transport.protocol` returns as the transport source-of-truth.
- `ctx.req.route` becomes `{ action?: string, pattern: string, original: string }`.
- `ctx.req.routeValue` does not exist; use `ctx.req.route.original` instead.
- HTTP sets `route.action = method`, `route.pattern = "/path/:id"`, `route.original = "/path/123"`.
- Non-HTTP may omit `action` or set it to an operation/event name.
- Router registration is object-only:
  - `router.handle({ protocol, action?, pattern, handler })`.

## Detailed Plan

1. Update request shape and docs

- In `src/core/req.ts`, move `protocol` back into `transport` and remove it from `route`.
- Make `route.action` optional; keep `pattern` and `original`.
- Ensure no `routeValue` field or references remain.
- Update doc comments to reflect path-only pattern for HTTP and optional action for other transports.

2. Change route registration API (breaking)

- In `src/router/types.ts`, update `TRoute` to store `{ protocol, action?, pattern, matcher, handler }`.
- In `src/router/router.ts`, change `handle()` to accept only `{ protocol, action?, pattern, handler }`.
- Add runtime validation: if input is not an object or missing required fields, throw a clear error.
- Remove string parsing or legacy overloads entirely.

3. Update router matching logic (precise rules)

- Match on `ctx.req.transport.protocol` first; protocol is required.
- If the registered route has `action`:
  - Require `ctx.req.route.action` to be a non-empty string that matches exactly.
  - If `ctx.req.route.action` is undefined/empty, do not match.
- If the registered route has no `action`:
  - Treat it as a wildcard for that protocol+pattern (matches any action).
- Match the path/operation using `route.matcher(ctx.req.route.original)`.
- Precedence:
  - Exact action match wins over wildcard for the same protocol+pattern.
  - If multiple routes tie on specificity, first registered wins.
- If pattern matches but action fails, continue searching.

4. Update adapter behavior (Express)

- In `src/adapter/express.v5.ts`, set `ctx.req.transport.protocol = "http"`.
- Set `ctx.req.route.action = method`, `pattern = path`, `original = path`.
- Keep method/path in `ctx.req.transport.request` as they are today.

5. Update hooks/logging

- In `src/defaultHook/hook.onExecBefore.ts`, log `route.pattern` and `route.original` (path-only).
- If method is needed in logs, add it explicitly from `ctx.req.route.action` or `ctx.req.transport.request.method`.

6. Update tests (expand coverage)

- In `tests/adapter/express.v5.test.ts`, assert path-only `pattern`/`original` and `action = method`.
- In `tests/router.test.ts`, register routes using object form only.
- Add coverage for:
  - mixed protocols for the same pattern
  - action mismatch with successful pattern match (should not match)
  - action omitted (wildcard) vs action present (specific)
  - action values: empty string vs undefined vs null
  - protocol mismatch => handler not found

7. Update examples

- In `examples/express/src/router.ts`, use object form in all routes.
- In `examples/express/src/server.ts`, keep log output path-only.

8. Route utils audit (make it explicit)

- Inspect `src/router/route.ts` for `buildRoute`, `parseRoute`, `isCanonicalRoute`.
- If they are now unused with object-only routes, remove the functions and their exports.
- If any external code still relies on them, decide whether to keep them as utility-only helpers or delete and update exports accordingly.

9. Performance considerations

- The object checks add negligible overhead compared to path matching.
- No new indexing/caching is required for this change.
- Optional future improvement (out of scope): index routes by protocol and action to reduce matcher calls.

10. Verification

- Run `pnpm build` and `pnpm test`.
- Confirm logs show clean path-only pattern.
- Confirm HTTP method routing works via `action`.
