# Express Example

Basic Express HTTP server using ctx-router.

## Features Demonstrated

- ✅ HTTP request transformation (`toCtx.fromExpress`)
- ✅ Route registration with patterns (`/user/:userId`)
- ✅ Path parameter extraction
- ✅ Role-based authorization
- ✅ Error handling with `CtxError`
- ✅ Health check endpoints
- ✅ 3-function handler pattern (auth, validate, execute)

## Running

From the **root directory**:

```bash
# Install and build
pnpm install
pnpm build

# Run dev server
pnpm dev
```

Or from this directory:

```bash
pnpm install
pnpm dev
```

Server runs on `http://localhost:3001`

## API Endpoints

### Health Check

```bash
GET http://localhost:3001/health/ping
```

### User Update (Requires Auth)

```bash
POST http://localhost:3001/user/update
Content-Type: application/json

{
  "userId": "123",
  "userName": "John Doe"
}
```

### User Detail (Requires Auth)

```bash
GET http://localhost:3001/user/123
```

**Note**: Auth endpoints will fail by default because anonymous users have `role: ["none"]`. To test, you'll need to modify the transformer to populate `ctx.user` from JWT or similar.

## Project Structure

```
src/
├── server.ts                    # Express server setup
├── router.ts                    # Router configuration
└── api/
    ├── health/
    │   ├── healthPing.api.ts   # Health check handler
    │   └── index.ts            # Health exports
    └── user/
        ├── userUpdate.api.ts   # Update user handler
        ├── userDetail.api.ts   # Get user handler
        └── index.ts            # User exports
```

## Handler Pattern

Each API handler follows this 3-function pattern:

```typescript
// 1. Authentication
export async function auth(ctx: TCtx): Promise<TCtx> {
  // Check permissions, throw if unauthorized
  return ctx;
}

// 2. Validation
export async function validate(ctx: TCtx): Promise<TReqData> {
  // Validate and extract request data
  return ctx.req.data as TReqData;
}

// 3. Business Logic
export async function execute(reqData: TReqData): Promise<TResData> {
  // Pure business logic, no ctx dependency
  return result;
}
```

The router automatically chains them: `auth → validate → execute`

## Key Files

### `server.ts`

- Sets up Express
- Transforms all requests to CTX using `toCtx.fromExpress(req)`
- Maps CTX response codes to HTTP status codes
- Returns JSON response

### `router.ts`

- Creates `CtxRouter` instance
- Defines custom error map with `ctxErrMap()`
- Registers routes with patterns

### `api/*/index.ts`

- Chains auth → validate → execute
- Sets `ctx.res.data` with result
- Returns modified context

## Adding New Routes

1. Create handler file: `src/api/product/productCreate.api.ts`
2. Export `auth`, `validate`, `execute` functions
3. Register in `router.ts`:

```typescript
import * as product from "./api/product";
router.handle("POST", "/product", product.create);
```

## Testing with curl

```bash
# Health check (no auth)
curl http://localhost:3001/health/ping

# User update (will fail auth with default setup)
curl -X POST http://localhost:3001/user/update \
  -H "Content-Type: application/json" \
  -d '{"userId": "123", "userName": "John"}'

# User detail with path param
curl http://localhost:3001/user/123
```

## Notes

- This example installs `ctx-router` from the workspace (local version)
- It only uses the public API - no internal imports
- Ready to copy into production projects
