import { match as pathMatch } from "path-to-regexp";
import { defaultHookOnExecBefore } from "../defaultHook/hook.onExecBefore";
import { defaultHookOnExecError } from "../defaultHook/hook.onExecError";
import { TDefaultCtx } from "../core";
import { TRoute, THooks, LogLevel, CtxRouterConfig } from "./types";
import { TRouterInstance, createRouterInstance } from "./instance";
import { exec as execImpl } from "./lifecycle.exec";

export class CtxRouter<TContext extends TDefaultCtx> {
  private routes: TRoute<TContext>[] = [];
  private hooks: THooks<TContext>;
  public logLevel: LogLevel;

  // Router-level INSTANCE
  private readonly instance: TRouterInstance;

  // Public readonly getter
  public get INSTANCE() {
    return { ...this.instance };
  }

  constructor(config: CtxRouterConfig = {}) {
    this.logLevel = config.logLevel ?? "standard";
    this.instance = createRouterInstance();
    this.hooks = {
      // Exec lifecycle (outer)
      onExecBefore: defaultHookOnExecBefore(this.logLevel),
      onExecAfter: async (ctx) => ctx,
      onExecError: defaultHookOnExecError,
      onExecFinally: async (ctx) => ctx,
      // Handler lifecycle (inner)
      onHandlerBefore: async (ctx) => ctx,
      onHandlerAfter: async (ctx) => ctx,
      onHandlerError: async (ctx) => ctx,
      onHandlerFinally: async (ctx) => ctx,
    };
  }

  // Exec lifecycle hook setters
  hookOnExecBefore(handler: THooks<TContext>["onExecBefore"]) {
    this.hooks.onExecBefore = handler;
  }

  hookOnExecAfter(handler: THooks<TContext>["onExecAfter"]) {
    this.hooks.onExecAfter = handler;
  }

  /**
   * Creates a new context with default values.
   * Does NOT increment inflight or set timing - that happens in exec().
   * Adapters should enrich the returned context before calling exec().
   */
  public createCtx(): TContext {
    // Build default user (anonymous)
    const user = {
      kind: "user" as const,
      id: "none",
      role: ["none" as const],
      scope: [],
      handle: null,
    };

    // Build ctx with defaults (timing and tracing set in exec())
    const ctx: TDefaultCtx = {
      id: "PENDING", // Set in exec()
      req: {
        data: {},
        route: "PENDING", // Router will set in exec
        routeValue: "PENDING", // Adapter will set
        transport: {
          protocol: "unknown",
          raw: null,
        },
      },
      res: {
        code: "OK",
        msg: "OK",
        data: {},
      },
      err: null,
      user,
      meta: {
        serviceName: this.instance.SERVICE_NAME,
        instance: {
          id: this.instance.ID,
          createdAt: this.instance.CREATED_AT,
          seq: -1, // Set in exec()
          inflight: -1, // Set in exec()
          cpu: -1, // Set in exec()
          mem: -1, // Set in exec()
        },
        ts: {
          in: -1, // Set in exec()
          clientIn: -1, // Set in exec()
          out: -1,
          execTime: -1,
          owd: -1, // Set in exec()
        },
        monitor: {
          traceId: "PENDING", // Set in exec()
          spanId: "PENDING", // Set in exec()
        },
        log: {
          stdout: [],
          db: [],
        },
      },
    };

    return ctx as TContext;
  }

  async exec(ctx: TContext): Promise<TContext> {
    return await execImpl(ctx, this.routes, this.hooks, this.instance);
  }

  handle(route: string, handler: (ctx: TContext) => Promise<TContext>) {
    const matcher = pathMatch(route, { decode: decodeURIComponent });
    this.routes.push({
      pattern: route,
      matcher,
      handler,
    });
  }

  hookOnExecError(handler: THooks<TContext>["onExecError"]) {
    this.hooks.onExecError = handler;
  }

  hookOnExecFinally(handler: THooks<TContext>["onExecFinally"]) {
    this.hooks.onExecFinally = handler;
  }

  // Handler lifecycle hook setters
  hookOnHandlerBefore(handler: THooks<TContext>["onHandlerBefore"]) {
    this.hooks.onHandlerBefore = handler;
  }

  hookOnHandlerAfter(handler: THooks<TContext>["onHandlerAfter"]) {
    this.hooks.onHandlerAfter = handler;
  }

  hookOnHandlerError(handler: THooks<TContext>["onHandlerError"]) {
    this.hooks.onHandlerError = handler;
  }

  hookOnHandlerFinally(handler: THooks<TContext>["onHandlerFinally"]) {
    this.hooks.onHandlerFinally = handler;
  }
}
