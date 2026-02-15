# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2](https://github.com/NeuronEnix/ctx-router/compare/v0.2.1...v0.2.2) (2026-02-15)


### Bug Fixes

* **ci:** set up pnpm before node cache in publish workflow ([c7f5219](https://github.com/NeuronEnix/ctx-router/commit/c7f52196c0458cbac5247dc1a644a4b5212e595e))
* feat: release please integration ([20b9bc7](https://github.com/NeuronEnix/ctx-router/commit/20b9bc78bae2c2755abf64462b056c48e9856fea))
* guard cpu stats sampling and narrow release workflow triggers ([b884699](https://github.com/NeuronEnix/ctx-router/commit/b884699a49b6861502b4c72afa05899738d01feb))

## [0.2.1] - 2026-02-15

### Changed

- Improved route handling and internal logging
- Updated route definitions to use explicit path segments
- Enhanced route matching with variant expansion support

## [0.2.0] - 2025-02-14

### ⚠️ Breaking Changes

- **Removed default execution hooks**: Default `onExecBefore` and `onExecError` hooks have been removed. Users must now explicitly register their own error handlers using `router.hook.onExec.error()`. Without an error hook, errors will be re-thrown.
- **Removed statsEnabled parameter**: The `statsEnabled` configuration option has been removed from `CtxRouter` constructor and `exec()` function. Stats are now always computed lazily.
- **Changed via() return type**: The `router.via()` method now returns a scoped builder with only `route` and `via` methods, preventing direct handler registration without segments.
- **Renamed context type parameters**: Unified context type parameter naming across router components for consistency (`TCtx` → `TUserCtx`).

### Added

- **RouteBuilder Pattern**: Introduced immutable `RouteBuilder` class for enhanced route management with fluent API
- **Global Middleware Support**: Added `router.via(...middleware)` to apply middleware globally to all subsequently registered routes
- **Route Specificity Sorting**: Intelligent route matching that prioritizes:
  - Exact matches (O(1) lookup)
  - Routes with more static segments
  - Routes with fewer parameters
  - Longer patterns over shorter ones
- **Ingest Latency Tracking**: Added `ingestLatency` field to `ctx.meta.ts` for tracking request processing delays
- **Service Name Configuration**: Enhanced router config to accept `serviceName` for better observability
- **Improved Error Handling**: Better error messages and structured error data in `ctxRouterErr`

### Changed

- **Hook System Simplified**: Removed default hooks in favor of explicit user-defined hooks for better control
- **Context Type Consistency**: Unified type parameter naming across all router components
- **Builder-based Routing**: Route registration now uses immutable builder pattern for type safety
- **Documentation Updates**:
  - Updated README with 900+ lines of comprehensive documentation
  - Added badges (npm version, license, TypeScript, bundle size)
  - Clarified hook system (single exec lifecycle, not dual)
  - Updated CLAUDE.md to reflect actual implementation

### Fixed

- **LICENSE**: Updated copyright to correct author name (Kaushik R Bangera)
- **Hook Documentation**: Corrected CLAUDE.md to remove references to non-existent "dual lifecycle hooks"

### Package Improvements

- **Added .npmignore**: Cleaner npm packages by excluding source files, tests, examples, and dev configs
- **Added CHANGELOG.md**: Proper version tracking and release notes
- **Added prepublishOnly script**: Ensures clean build and passing tests before publish
- **Added sideEffects: false**: Better tree-shaking support for bundlers

### Migration Guide (v0.1.0 → v0.2.0)

#### Error Handling (Required)

```typescript
// Before (v0.1.0): Default error handler was provided
const router = new CtxRouter();

// After (v0.2.0): Must register error handler explicitly
const router = new CtxRouter();
router.hook.onExec.error(async (ctx, err) => {
  ctx.res.code = "ERROR";
  ctx.res.msg = err.message;
  ctx.err = err;
});
```

#### Global Middleware

```typescript
// New in v0.2.0: Apply middleware to all routes
router
  .via(authMiddleware, loggingMiddleware)
  .route("GET /api/users")
  .to(handler);
```

#### Context Type Parameter

```typescript
// Before (v0.1.0)
function myHandler(ctx: TCtx): Promise<TCtx> { ... }

// After (v0.2.0)
function myHandler(ctx: TUserCtx): Promise<TUserCtx> { ... }
// Or keep using TDefaultCtx directly
```

---

## [0.1.0] - 2025-01-18

### Added

- Initial release of ctx-router
- **Core Router**: Transport-agnostic routing with unified context
- **Fluent Route Builder**: Expressive DSL with `route()`, `via()`, `to()` methods
- **Pattern Matching**: Support for `:param` extraction using `path-to-regexp`
- **HTTP Grammar Detection**: Auto-detect method and path from strings like `"GET /user/:id"`
- **Lifecycle Hooks**: Cross-cutting concerns with `onExec.before/after/error/finally`
- **Type-Safe Error Handling**: `CtxBaseError` and `ctxErrMap` for structured errors
- **Express Adapter**: `enrichFromExpress()` adapter for Express.js integration
- **Route Specificity Sorting**: Intelligent route matching with exact matches (O(1)) and sorted param routes
- **Global Middleware Support**: Apply middleware to all routes with `router.via()`
- **Context Extensions**: Extend `TDefaultCtx` with custom fields
- **Instance Metrics**: Track SEQ, INFLIGHT, CPU, memory usage
- **Configurable Logging**: `none`, `minimal`, `standard`, `verbose` log levels
- **Hook Sealing**: Prevents hook modifications after first execution

### Technical Details

- TypeScript 5.9 with strict mode enabled
- Bundle size: ~37 KB (uncompressed)
- Comprehensive test coverage (76 tests)
- Zero runtime dependencies except `path-to-regexp`

### Documentation

- Complete README with examples and API reference
- Quick start guide
- Handler pattern guidelines
- Error handling documentation
- Lifecycle hooks documentation

[0.2.1]: https://github.com/NeuronEnix/ctx-router/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/NeuronEnix/ctx-router/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/NeuronEnix/ctx-router/releases/tag/v0.1.0
