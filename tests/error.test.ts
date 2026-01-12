import { describe, it, expect } from "vitest";
import { CtxError, ctxErrMap } from "../src/router/error";

describe("CtxError", () => {
  it("sets name and message from constructor", () => {
    const error = new CtxError({
      name: "TEST_ERROR",
      msg: "Test error message",
    });

    expect(error.name).toBe("TEST_ERROR");
    expect(error.message).toBe("Test error message");
  });

  it("sets data when provided", () => {
    const error = new CtxError({
      name: "TEST_ERROR",
      msg: "Test error",
      data: { field: "email", value: "invalid" },
    });

    expect(error.data).toEqual({ field: "email", value: "invalid" });
  });

  it("defaults data to empty object when not provided", () => {
    const error = new CtxError({
      name: "TEST_ERROR",
      msg: "Test error",
    });

    expect(error.data).toEqual({});
  });

  it("sets info when provided", () => {
    const error = new CtxError({
      name: "TEST_ERROR",
      msg: "Test error",
      info: { userId: 123, timestamp: 1234567890 },
    });

    expect(error.info).toEqual({ userId: 123, timestamp: 1234567890 });
  });

  it("extends Error class", () => {
    const error = new CtxError({
      name: "TEST_ERROR",
      msg: "Test error",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.stack).toBeDefined();
  });
});

describe("ctxErrMap", () => {
  const ctxErr = ctxErrMap({
    auth: {
      UNAUTHORIZED: "User is not authorized",
      TOKEN_EXPIRED: "Token has expired",
    },
    validation: {
      INVALID_EMAIL: "Email address is invalid",
    },
  });

  it("creates error factories for each category", () => {
    expect(ctxErr.auth).toBeDefined();
    expect(ctxErr.validation).toBeDefined();
  });

  it("creates error factories for each error in category", () => {
    expect(typeof ctxErr.auth.UNAUTHORIZED).toBe("function");
    expect(typeof ctxErr.auth.TOKEN_EXPIRED).toBe("function");
    expect(typeof ctxErr.validation.INVALID_EMAIL).toBe("function");
  });

  it("factory returns CtxError with correct name and default message", () => {
    const error = ctxErr.auth.UNAUTHORIZED();

    expect(error).toBeInstanceOf(CtxError);
    expect(error.name).toBe("UNAUTHORIZED");
    expect(error.message).toBe("User is not authorized");
  });

  it("factory allows overriding message", () => {
    const error = ctxErr.auth.UNAUTHORIZED({
      msg: "Custom unauthorized message",
    });

    expect(error.message).toBe("Custom unauthorized message");
    expect(error.name).toBe("UNAUTHORIZED");
  });

  it("factory allows adding data", () => {
    const error = ctxErr.auth.UNAUTHORIZED({
      data: { reason: "invalid_token", userId: "123" },
    });

    expect(error.data).toEqual({ reason: "invalid_token", userId: "123" });
  });

  it("factory allows adding info", () => {
    const error = ctxErr.validation.INVALID_EMAIL({
      info: { attemptedAt: 1234567890 },
    });

    expect(error.info).toEqual({ attemptedAt: 1234567890 });
  });

  it("factory allows combining msg, data, and info", () => {
    const error = ctxErr.auth.TOKEN_EXPIRED({
      msg: "Your session has expired",
      data: { expiredAt: "2024-01-01" },
      info: { tokenId: "abc123" },
    });

    expect(error.name).toBe("TOKEN_EXPIRED");
    expect(error.message).toBe("Your session has expired");
    expect(error.data).toEqual({ expiredAt: "2024-01-01" });
    expect(error.info).toEqual({ tokenId: "abc123" });
  });
});
