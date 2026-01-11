/**
 * Client-safe error data that can be included in API responses.
 * Should contain only non-sensitive information.
 */
type TCtxErrorData = {
  [key: string]: number | string | object | boolean | null;
};

/**
 * Structured error configuration for CtxError.
 *
 * @property name - Error identifier (constant, uppercase, e.g., "UNAUTHORIZED")
 * @property msg - Human-readable error message for users
 * @property data - Client-safe data that can be sent in API responses (non-sensitive)
 * @property info - Internal debugging information (logged server-side only, never sent to client)
 *
 * @example
 * ```typescript
 * const error: TCtxError = {
 *   name: "INVALID_INPUT",
 *   msg: "Email address is required",
 *   data: { field: "email" },
 *   info: { userId: 123, timestamp: Date.now() }
 * };
 * ```
 */
type TCtxError = {
  name: string;
  msg: string;
  data?: TCtxErrorData;
  info?: unknown;
};

/**
 * Custom error class for ctx-router with structured error handling.
 *
 * Extends the native Error class with additional fields for client-safe data
 * and internal debugging information.
 *
 * @property name - Error identifier (inherited from Error, set from TCtxError.name)
 * @property message - Human-readable error message (inherited from Error, set from TCtxError.msg)
 * @property data - Client-safe data included in API responses
 * @property info - Internal debugging info (logged server-side, never sent to client)
 * @property stack - Stack trace (inherited from Error)
 *
 * @example
 * ```typescript
 * throw new CtxError({
 *   name: "UNAUTHORIZED",
 *   msg: "Invalid credentials",
 *   data: { reason: "invalid_token" },
 *   info: { attemptedAt: Date.now(), ip: "192.168.1.1" }
 * });
 * ```
 */
export class CtxError extends Error {
  data: { [key: string]: number | string | object | boolean | null };
  info?: unknown;
  constructor({ name, msg, data, info }: TCtxError) {
    super(msg);
    super.name = name;
    this.data = data || {};
    this.info = info;
  }
}

/**
 * Partial error properties for overriding default error messages or adding context.
 * Used when throwing errors from the error map.
 */
type TResErr = Partial<Pick<TCtxError, "data" | "info" | "msg">>;

/**
 * Internal factory function to create CtxError instances.
 *
 * @param key - Error name constant
 * @param msg - Default error message
 * @param e - Optional overrides for msg, data, or info
 * @returns A new CtxError instance
 */
function createError(key: string, msg: string, e?: TResErr): CtxError {
  return new CtxError({
    name: key,
    msg: msg,
    ...e,
  });
}

/**
 * Factory function to create a type-safe error map organized by category.
 *
 * Creates a structured error map where errors are grouped by category (e.g., auth, validation)
 * and each error has a factory function that returns a CtxError instance.
 *
 * @template T - Object type where keys are categories and values are error name-to-message mappings
 * @param errKeyMsg - Nested object defining error categories and their error names with default messages
 * @returns Type-safe error map with factory functions for each error
 *
 * @example
 * ```typescript
 * const ctxErr = ctxErrMap({
 *   auth: {
 *     UNAUTHORIZED: "User is not authorized",
 *     TOKEN_EXPIRED: "Authentication token has expired",
 *     INVALID_TOKEN: "Invalid authentication token"
 *   },
 *   validation: {
 *     INVALID_EMAIL: "Email address is invalid",
 *     REQUIRED_FIELD: "Required field is missing"
 *   }
 * });
 *
 * // Usage: Throw with default message
 * throw ctxErr.auth.UNAUTHORIZED();
 *
 * // Usage: Override message and add data
 * throw ctxErr.auth.UNAUTHORIZED({
 *   msg: "Custom message",
 *   data: { userId: 123 }
 * });
 *
 * // Usage: Add internal debugging info
 * throw ctxErr.validation.INVALID_EMAIL({
 *   data: { field: "email", value: "invalid@" },
 *   info: { validationRule: "RFC5322", attemptedAt: Date.now() }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // In your router file
 * export const ctxErr = ctxErrMap({
 *   general: {
 *     UNKNOWN_ERROR: "Something went wrong",
 *     NOT_FOUND: "Resource not found",
 *     HANDLER_NOT_FOUND: "Handler not found"
 *   },
 *   auth: {
 *     UNAUTHORIZED: "Unauthorized",
 *     FORBIDDEN: "Forbidden"
 *   }
 * });
 *
 * // In your API handlers
 * async function auth(ctx: TCtx): Promise<TCtx> {
 *   if (!ctx.req.auth?.bearerToken) {
 *     throw ctxErr.auth.UNAUTHORIZED({
 *       data: { reason: "missing_token" }
 *     });
 *   }
 *   return ctx;
 * }
 * ```
 *
 * Benefits:
 * - Type-safe error handling with autocomplete
 * - Centralized error definitions
 * - Consistent error structure across application
 * - Separation of client-safe data (data) and internal info (info)
 */
export function ctxErrMap<T extends Record<string, Record<string, string>>>(
  errKeyMsg: T
) {
  return Object.fromEntries(
    Object.keys(errKeyMsg).map((category) => [
      category,
      Object.fromEntries(
        Object.keys(
          errKeyMsg[category as keyof T] as Record<string, string>
        ).map((key) => [
          key,
          (e?: TResErr) =>
            createError(key, errKeyMsg[category as keyof T]![key] as string, e),
        ])
      ),
    ])
  ) as {
    [K in keyof T]: {
      [P in keyof T[K]]: (e?: TResErr) => CtxError;
    };
  };
}
