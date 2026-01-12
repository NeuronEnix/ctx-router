import { match as pathMatch } from "path-to-regexp";
import { defaultHookOnExecBefore } from "../defaultHook/hook.onExecBefore";
import { defaultHookOnExecError } from "../defaultHook/hook.onExecError";
import { TDefaultCtx } from "../core";
import "../common/helper"; // Auto-starts stats collection
import { TRoute, THooks, LogLevel, CtxRouterConfig } from "./types";
import { TRouterInstance, createRouterInstance } from "./instance";
import { begin as beginImpl } from "./lifecycle.begin";
import { exec as execImpl } from "./lifecycle.exec";
import { end as endImpl } from "./lifecycle.end";

export class CtxRouter<TContext extends TDefaultCtx> {
  private routes: TRoute<TContext>[] = [];
  private hooks: THooks;
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
  hookOnExecBefore(handler: THooks["onExecBefore"]) {
    this.hooks.onExecBefore = handler;
  }

  hookOnExecAfter(handler: THooks["onExecAfter"]) {
    this.hooks.onExecAfter = handler;
  }

  public begin(): TContext {
    return beginImpl<TContext>(this.instance);
  }

  async exec(ctx: TContext): Promise<TContext> {
    return await execImpl(ctx, this.routes, this.hooks);
  }

  public end(ctx: TContext): void {
    endImpl(ctx, this.instance);
  }

  handle(route: string, handler: (ctx: TContext) => Promise<TContext>) {
    const matcher = pathMatch(route, { decode: decodeURIComponent });
    this.routes.push({
      pattern: route,
      matcher,
      handler,
    });
  }

  hookOnExecError(handler: THooks["onExecError"]) {
    this.hooks.onExecError = handler;
  }

  hookOnExecFinally(handler: THooks["onExecFinally"]) {
    this.hooks.onExecFinally = handler;
  }

  // Handler lifecycle hook setters
  hookOnHandlerBefore(handler: THooks["onHandlerBefore"]) {
    this.hooks.onHandlerBefore = handler;
  }

  hookOnHandlerAfter(handler: THooks["onHandlerAfter"]) {
    this.hooks.onHandlerAfter = handler;
  }

  hookOnHandlerError(handler: THooks["onHandlerError"]) {
    this.hooks.onHandlerError = handler;
  }

  hookOnHandlerFinally(handler: THooks["onHandlerFinally"]) {
    this.hooks.onHandlerFinally = handler;
  }
}
