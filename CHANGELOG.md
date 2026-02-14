# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-02-14

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

[0.1.0]: https://github.com/NeuronEnix/ctx-router/releases/tag/v0.1.0
