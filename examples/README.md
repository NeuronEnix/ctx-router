# ctx-router Examples

This directory contains example projects demonstrating how to use `ctx-router` with different transport layers.

Each example is a standalone mini-project that installs `ctx-router` like a real consumer would, using pnpm workspaces.

## Available Examples

### [express](./express) - Express HTTP Server

Basic Express server showing:

- HTTP request transformation
- Route handling with path parameters
- Error handling
- Role-based authorization
- Health check endpoints

## Running Examples

From the **root directory**:

```bash
# Install dependencies
pnpm install

# Build ctx-router first
pnpm build

# Run express example
pnpm dev

# Or run directly in the example directory
cd examples/express
pnpm dev
```

## Example Structure

Each example follows this pattern:

```
examples/express/
├── src/
│   ├── server.ts      # Server setup
│   ├── router.ts      # Route configuration
│   └── api/           # API handlers
├── package.json       # Dependencies (installs ctx-router from workspace)
├── tsconfig.json      # TypeScript config
└── nodemon.json       # Dev server config
```

## Adding New Examples

To add a new example (e.g., `lambda`):

1. Create directory: `examples/lambda`
2. Add `package.json` with `"ctx-router": "*"` dependency
3. Implement transformer and handlers
4. The workspace will automatically link to the local `ctx-router`

## Why Separate Examples?

Each example:

- ✅ Uses only the public API (no internal imports)
- ✅ Behaves like a real consumer project
- ✅ Can be copied directly into production code
- ✅ Catches API design issues early
- ✅ Demonstrates best practices

This is the gold standard for library examples.
