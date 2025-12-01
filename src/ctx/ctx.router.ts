import { handleBeforeExec } from "../defaultHandler/handle.beforeExec";
import { handleOnError } from "../defaultHandler/handle.onError";
import { CtxError } from "./ctx.err";
import { TDefaultCtx as TDefaultCtx } from "./ctx.types";
import { RedisClientType } from "@redis/client";

type TRouteObj<TContext extends TDefaultCtx> = Record<
  string,
  Record<string, (ctx: TContext) => Promise<TContext>>
>;
type THooks = {
  beforeExec<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  onError<TContext extends TDefaultCtx>(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  onFinally<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
};

type CtxRouterConfig = {
  log?: { capture: boolean };
  stream?: { redisClient: RedisClientType; key: string };
};
const ogLog = console.log;
export class CtxRouter<TContext extends TDefaultCtx> {
  private routeObj: TRouteObj<TContext> = {};
  private hooks: THooks;
  private consoleLogList: unknown[] = [];
  private config: CtxRouterConfig;
  constructor(config: CtxRouterConfig) {
    this.config = config;
    this.setConfig();
    this.hooks = {
      beforeExec: handleBeforeExec,
      onError: handleOnError,
      onFinally: async (ctx) => ctx,
    };
  }

  private setConfig() {
    if (this.config.log?.capture) {
      console.log = (...args: unknown[]) => {
        try {
          ogLog(...args);
          const processedArgs = args.flatMap((arg) => {
            if (arg instanceof Error) {
              return [arg.stack, arg];
            }
            return arg;
          });
          this.consoleLogList.push(...processedArgs);
        } catch (error) {
          ogLog(error);
          this.consoleLogList.push(error);
        }
      };
    }
  }
  start() {
    this.consoleLogList = [];
  }
  logGetRef() {
    return this.consoleLogList;
  }
  logConsole(...args: unknown[]) {
    ogLog(...args);
  }

  async flushToStream(ctx: TContext) {
    if (!this.config.stream) return;
    const { redisClient, key } = this.config.stream;
    await redisClient.xAdd(key, "*", { ctx: JSON.stringify(ctx) });
  }

  beforeExecHook(handler: THooks["beforeExec"]) {
    this.hooks.beforeExec = handler;
  }

  async exec(ctx: TContext): Promise<TContext> {
    try {
      await this.hooks.beforeExec(ctx);
      const handler = this.routeObj[ctx.req.method]?.[ctx.req.path];
      if (!handler) {
        throw new CtxError({
          name: "HANDLER_NOT_FOUND",
          msg: "Handler not found",
          data: { method: ctx.req.method, path: ctx.req.path },
        });
      }
      return await handler(ctx);
    } catch (error) {
      return await this.hooks.onError(ctx, error);
    } finally {
      await this.hooks.onFinally(ctx);
    }
  }

  handle(
    method: string,
    path: string,
    handler: (ctx: TContext) => Promise<TContext>
  ) {
    const methodRoute = this.routeObj[method] || (this.routeObj[method] = {});
    methodRoute[path] = handler;
  }

  onErrorHook(handler: THooks["onError"]) {
    this.hooks.onError = handler;
  }
  onFinallyHook(handler: THooks["onFinally"]) {
    this.hooks.onFinally = handler;
  }
}
