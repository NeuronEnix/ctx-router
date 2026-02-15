# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0](https://github.com/NeuronEnix/ctx-router/compare/ctx-router-v0.2.1...ctx-router-v1.0.0) (2026-02-15)


### ⚠ BREAKING CHANGES

* Complete API replacement. Routes now registered via router.on(segment).handle(handler) instead of router.on(config, handler).
* consolidate lifecycle into exec() and improve type safety
* Refactored hook system from 5 hooks to 8 hooks with dual lifecycle
* getNewCtx() renamed to begin()
* router.handle() signature changed
* toCtx.fromExpress has been completely removed
* Context creation flow has been restructured
* **types:** CtxUser role is now an array instead of a single value, and IBaseApi interface has been removed

### Features

* add CPU and memory stats collection ([7e34ef7](https://github.com/NeuronEnix/ctx-router/commit/7e34ef7046285b4da493de4a09b05e7b02b971ec))
* add default hooks for execution lifecycle management ([4fabda0](https://github.com/NeuronEnix/ctx-router/commit/4fabda0c95c46e60f8b39a7f78e1bdcd8d3d942f))
* add fluent route API with via() middleware and to() handler ([4e1ab3e](https://github.com/NeuronEnix/ctx-router/commit/4e1ab3e2e6a0308ae1d8df188af3648edc178d6d))
* add global middleware support and route specificity sorting in CtxRouter ([f53c4ea](https://github.com/NeuronEnix/ctx-router/commit/f53c4eabd64f3532d2dfb4ca8c4f03974e38e7d6))
* add ingest latency tracking to context types and execution lifecycle ([89b51b0](https://github.com/NeuronEnix/ctx-router/commit/89b51b021d267b59f1c87a3fb81ecb103c4b32cd))
* enhance context types and express adapter ([44a2c65](https://github.com/NeuronEnix/ctx-router/commit/44a2c654c343804ac006bec65aaf6ba4fc2be765))
* enhance CtxRouter with service name configuration and improved error handling ([aabf974](https://github.com/NeuronEnix/ctx-router/commit/aabf974401af52a38139f5e6405694e0226ccb3d))
* enhance request context with framework identification ([344d5dd](https://github.com/NeuronEnix/ctx-router/commit/344d5dd76166a218ffe5c4c064e0346fea1249b2))
* implement dual lifecycle hooks (exec + handler) ([7ae0008](https://github.com/NeuronEnix/ctx-router/commit/7ae0008b224fdfa742f1440ef2667325c10c274a))
* implement Phase 2 refactor - canonical routes and telemetry controls ([709def9](https://github.com/NeuronEnix/ctx-router/commit/709def9acd17039851d626b25d31a1ab3e43d867))
* introduce core context types and error handling ([68a2a5b](https://github.com/NeuronEnix/ctx-router/commit/68a2a5bb775b67459f1306ee625d7d84c11e5c78))
* introduce RouteBuilder for enhanced route management in CtxRouter ([ae2b00f](https://github.com/NeuronEnix/ctx-router/commit/ae2b00fb33ca24519621c960b3f5836925d3dd4e))


### Bug Fixes

* guard cpu stats sampling and narrow release workflow triggers ([b884699](https://github.com/NeuronEnix/ctx-router/commit/b884699a49b6861502b4c72afa05899738d01feb))
* update environment variable access syntax in index.ts ([1c35ced](https://github.com/NeuronEnix/ctx-router/commit/1c35ced66b28de7f2b6f8bacd6c3e34fde4046b7))
* update metrics to use -1 for unavailable values ([9efb831](https://github.com/NeuronEnix/ctx-router/commit/9efb831b4fd218c7546abc902ed62f6f3134d2f7))
* update output timestamp to -1 for uninitialized context ([ab64160](https://github.com/NeuronEnix/ctx-router/commit/ab641604c6b3120dcd0c58732ba0988784875c65))
* update route definitions to use explicit path segments ([522a63a](https://github.com/NeuronEnix/ctx-router/commit/522a63a713c687af9b535547a457da9fb21b8ad5))


### Code Refactoring

* consolidate lifecycle into exec() and improve type safety ([1ed7d67](https://github.com/NeuronEnix/ctx-router/commit/1ed7d670511f81884f1b3996bedfe9942b6f12a6))
* implement pattern-first router with scoped API ([df06740](https://github.com/NeuronEnix/ctx-router/commit/df0674079cc759b986572b509e4b99ee500cad0b))
* introduce three-phase request lifecycle with begin/exec/end ([f57d834](https://github.com/NeuronEnix/ctx-router/commit/f57d83488fc66a40cc7c5a6b87c3b9746a57b3ae))
* make router protocol-agnostic with single route parameter ([e4a70da](https://github.com/NeuronEnix/ctx-router/commit/e4a70da12a9020ea3e3dfce95fec8075f471cae8))
* move INSTANCE to router and restructure context creation flow ([3e7a2b8](https://github.com/NeuronEnix/ctx-router/commit/3e7a2b846c643b355dbb57ce03144b836618b11c))
* remove deprecated toCtx namespace ([ce772d0](https://github.com/NeuronEnix/ctx-router/commit/ce772d0670641a403ec44f3d61fcb584bc872748))
* **types:** update context types with new fields and remove base API interface ([f3ab9bf](https://github.com/NeuronEnix/ctx-router/commit/f3ab9bf65730d163c3017807242f75ef2741cfc0))

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
