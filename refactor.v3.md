# Refactor Phase 3

## Route Data Grouping

- Move route data into `ctx.req.route` with `{ protocol, action, pattern, original }`.
- Remove `protocol` from `ctx.req.transport` to avoid duplication.
- Update adapters, router lifecycle, hooks, tests, and examples to use the new route shape.
- Add migration notes for replacing `ctx.req.routeValue` and `ctx.req.route`.
