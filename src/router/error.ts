/**
 * @file Error Handling System for ctx-router
 *
 * ## Overview
 *
 * This module provides a structured error handling system that distinguishes between
 * internal router errors and user application errors. Both share the same base class
 * (CtxBaseError) but are thrown from different contexts with different error instances.
 *
 * ## Error Hierarchy
 *
 * ```
 * Error (native)
 *   └── CtxBaseError (base, DO NOT throw directly)
 *       ├── CtxRouterError (internal router errors)
 *       └── YourAppError (user application errors - you define this)
 * ```
 *
 * ## Key Concepts
 *
 * ### TCtxBaseError (Type)
 * - Interface for error constructor parameters
 * - Use when extending CtxBaseError to create custom error classes
 * - Should NOT be thrown directly (it's just a type, not a class)
 *
 * ### CtxBaseError (Class)
 * - Base error class with structured fields (name, msg, data, info)
 * - Should NOT be thrown directly in application code
 * - Extend this to create your own error classes
 *
 * ### CtxRouterError (Class)
 * - Used internally by ctx-router framework
 * - Thrown via `ctxRouterErr` error map
 * - Examples: HANDLER_NOT_FOUND, internal routing errors
 *
 * ### User Error Classes
 * - You create these by extending CtxBaseError
 * - Use with ctxErrMap to create type-safe error factories
 * - Examples: auth errors, validation errors, business logic errors
 *
 * ## Usage Pattern
 *
 * ### 1. Define Your Error Class
 * ```typescript
 * class MyAppError extends CtxBaseError {
 *   constructor(e: TCtxBaseError) {
 *     super(e);
 *   }
 * }
 * ```
 *
 * ### 2. Create Error Map
 * ```typescript
 * const myErr = ctxErrMap(MyAppError, {
 *   auth: {
 *     UNAUTHORIZED: "Unauthorized access",
 *     TOKEN_EXPIRED: "Token has expired"
 *   },
 *   validation: {
 *     INVALID_INPUT: "Invalid input provided"
 *   }
 * });
 * ```
 *
 * ### 3. Throw Errors
 * ```typescript
 * throw myErr.auth.UNAUTHORIZED({
 *   data: { reason: "invalid_token" },
 *   info: { userId: 123, timestamp: Date.now() }
 * });
 * ```
 *
 * ## Benefits of This Approach
 *
 * - **Type Safety**: Autocomplete and type checking for all errors
 * - **Centralized Definitions**: All error messages in one place
 * - **Consistent Structure**: Same format across all errors
 * - **Router vs App Errors**: Distinguish between framework and application errors
 * - **Client-Safe Data**: Separate client-safe `data` from internal-only `info`
 */

/**
 * Client-safe error data that can be included in API responses.
 * Should contain only non-sensitive information.
 */
type TCtxErrorData = {
  [key: string]: number | string | object | boolean | null;
};

/**
 * Structured error configuration interface for error constructors.
 *
 * This type is used when constructing error instances. You should NOT throw
 * objects of this type directly. Instead, use this type when extending CtxBaseError
 * to create your own error classes.
 *
 * @property name - Error identifier (constant, uppercase, e.g., "UNAUTHORIZED")
 * @property msg - Human-readable error message for users
 * @property data - Client-safe data that can be sent in API responses (non-sensitive)
 * @property info - Internal debugging information (logged server-side only, never sent to client)
 *
 * @example
 * ```typescript
 * // Use this type when extending CtxBaseError
 * class MyAppError extends CtxBaseError {
 *   constructor(e: TCtxBaseError) {
 *     super(e);
 *   }
 * }
 * ```
 */
export type TCtxBaseError = {
  name: string;
  msg: string;
  data?: TCtxErrorData;
  info?: Record<string, unknown> | null | undefined;
};

/**
 * Base error class for ctx-router with structured error handling.
 *
 * **IMPORTANT: Do NOT throw this class directly.** This is a base class that
 * should be extended to create specific error types for your application or
 * internal router errors.
 *
 * Extends the native Error class with additional fields for client-safe data
 * and internal debugging information.
 *
 * @property name - Error identifier (inherited from Error, set from TCtxBaseError.name)
 * @property message - Human-readable error message (inherited from Error, set from TCtxBaseError.msg)
 * @property data - Client-safe data included in API responses
 * @property info - Internal debugging info (logged server-side, never sent to client)
 * @property stack - Stack trace (inherited from Error)
 *
 * @example
 * ```typescript
 * // Extend CtxBaseError to create your own error class
 * class MyAppError extends CtxBaseError {
 *   constructor(e: TCtxBaseError) {
 *     super(e);
 *   }
 * }
 *
 * // Use ctxErrMap to create error factories
 * const myErr = ctxErrMap(MyAppError, {
 *   auth: {
 *     UNAUTHORIZED: "Invalid credentials"
 *   }
 * });
 *
 * // Throw errors using the factory
 * throw myErr.auth.UNAUTHORIZED({
 *   msg: "Invalid credentials", // optional, overrides the default message
 *   data: { reason: "invalid_token" }, // optional, overrides the default data
 *   info: { attemptedAt: Date.now(), ip: "192.168.1.1" } // optional, overrides the default info
 * });
 * ```
 */
export class CtxBaseError extends Error {
  data: { [key: string]: number | string | object | boolean | null };
  info?: Record<string, unknown> | null | undefined;
  constructor({ name, msg, data, info }: TCtxBaseError) {
    super(msg);
    super.name = name;
    this.data = data || {};
    if (typeof info !== "undefined") this.info = info;
  }
}

/**
 * Internal router error class for ctx-router framework.
 *
 * This error class is used exclusively by the ctx-router framework for internal
 * errors such as "handler not found" or other routing failures. User applications
 * should NOT use this class directly. Instead, extend CtxBaseError to create your
 * own error classes.
 *
 * The distinction between CtxRouterError and user-defined error classes allows
 * error handling middleware to differentiate between framework errors and
 * application errors if needed.
 *
 * @example
 * ```typescript
 * // Internal router usage (via ctxRouterErr)
 * throw ctxRouterErr.handler.HANDLER_NOT_FOUND({
 *   data: { route: "/api/users" }
 * });
 * ```
 */
export class CtxRouterError extends CtxBaseError {
  constructor(e: TCtxBaseError) {
    super(e);
  }
}

/**
 * Partial error properties for overriding default error messages or adding context.
 * Used when throwing errors from the error map.
 */
type TBaseCtxErrParam = Partial<Pick<TCtxBaseError, "data" | "info" | "msg">>;

/**
 * Internal factory function to create CtxError instances.
 *
 * @param errorClass - Error class constructor to instantiate
 * @param key - Error name constant
 * @param msg - Default error message
 * @param e - Optional overrides for msg, data, or info
 * @returns A new error instance of the specified class
 */
function createError<TErrorClass extends typeof CtxBaseError>(
  errorClass: TErrorClass,
  key: string,
  msg: string,
  e?: TBaseCtxErrParam
): InstanceType<TErrorClass> {
  return new errorClass({
    name: key,
    msg: msg,
    ...e,
  }) as InstanceType<TErrorClass>;
}

/**
 * Factory function to create a type-safe error map organized by category.
 *
 * Creates a structured error map where errors are grouped by category (e.g., auth, validation)
 * and each error has a factory function that returns an error instance of the specified class.
 *
 * @template TErrorClass - Error class constructor that extends CtxBaseError
 * @template T - Object type where keys are categories and values are error name-to-message mappings
 * @param errorClass - Error class constructor to instantiate (e.g., CtxRouterError, custom user error class)
 * @param errKeyMsg - Nested object defining error categories and their error names with default messages
 * @returns Type-safe error map with factory functions for each error
 *
 * @example
 * ```typescript
 * // Define custom error class
 * class MyAppError extends CtxBaseError {
 *   constructor(e: TCtxBaseError) {
 *     super(e);
 *   }
 * }
 *
 * // Create error map with custom error class as first parameter
 * const ctxErr = ctxErrMap(MyAppError, {
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
 * class ResErr extends CtxBaseError {
 *   constructor(e: TCtxBaseError) {
 *     super(e);
 *   }
 * }
 *
 * export const ctxErr = ctxErrMap(ResErr, {
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
 * - Allows distinguishing between router errors and user application errors
 */
export function ctxErrMap<
  TErrorClass extends typeof CtxBaseError,
  T extends Record<string, Record<string, string>>,
>(errorClass: TErrorClass, errKeyMsg: T) {
  return Object.fromEntries(
    Object.keys(errKeyMsg).map((category) => [
      category,
      Object.fromEntries(
        Object.keys(
          errKeyMsg[category as keyof T] as Record<string, string>
        ).map((key) => [
          key,
          (e?: TBaseCtxErrParam) =>
            createError(
              errorClass,
              key,
              errKeyMsg[category as keyof T]![key] as string,
              e
            ),
        ])
      ),
    ])
  ) as {
    [K in keyof T]: {
      [P in keyof T[K]]: (e?: TBaseCtxErrParam) => InstanceType<TErrorClass>;
    };
  };
}

export const ctxRouterErr = ctxErrMap(CtxRouterError, {
  general: {
    UNKNOWN_ERROR: "Something went wrong",
  },
  hook: {
    HOOKS_ALREADY_SEALED:
      "Hooks must be registered during startup, before exec()",
  },
  router: {
    INVALID_ROUTE_SEGMENT: "Router.route() requires a non-empty string segment",
    INVALID_MIDDLEWARE: "Router.via() requires function arguments",
    INVALID_HANDLER: "Router.to() requires a function",
    MISSING_SEGMENTS:
      "Cannot register handler without segments. Use .route(segment) first.",
    MISSING_HANDLER: "Cannot register route without handler. Use .to(handler).",
  },
  handler: {
    HANDLER_NOT_FOUND: "Handler not found",
  },
});
