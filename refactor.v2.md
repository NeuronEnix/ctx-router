# Refactor Phase 2 (Deferred)

## Routing Format Enhancements

- Define a canonical route string format that works across HTTP, queues, and RPC.
- Decide on delimiter rules that avoid `:` conflicts with `path-to-regexp`.
- Optionally introduce a small `buildRoute()` helper to standardize route strings across transports.

## Telemetry Controls

- Add config or env flag to enable/disable stats updates at runtime.
- Consider per-router stats policies if multiple instances have different needs.
