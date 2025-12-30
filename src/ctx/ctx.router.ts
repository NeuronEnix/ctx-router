import { handleBeforeExec } from "../defaultHandler/handle.beforeExec";
import { handleOnError } from "../defaultHandler/handle.onError";
import { CtxError } from "./ctx.err";
import { TDefaultCtx as TDefaultCtx } from "./ctx.types";
import { match as pathMatch, MatchFunction } from "path-to-regexp";

type TRoute<TContext extends TDefaultCtx> = {
  pattern: string;
  matcher: MatchFunction<object>;
  handler: (ctx: TContext) => Promise<TContext>;
};

type TRouteObj<TContext extends TDefaultCtx> = Record<
  string,
  TRoute<TContext>[]
>;

type THooks = {
  beforeExec<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  onError<TContext extends TDefaultCtx>(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  onFinally<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
};

export class CtxRouter<TContext extends TDefaultCtx> {
  private routeObj: TRouteObj<TContext> = {};
  private hooks: THooks;

  constructor() {
    this.hooks = {
      beforeExec: handleBeforeExec,
      onError: handleOnError,
      onFinally: async (ctx) => ctx,
    };
  }

  beforeExecHook(handler: THooks["beforeExec"]) {
    this.hooks.beforeExec = handler;
  }

  async exec(ctx: TContext): Promise<TContext> {
    try {
      await this.hooks.beforeExec(ctx);

      // Find matching route
      const routes = this.routeObj[ctx.req.method];
      if (!routes) {
        throw new CtxError({
          name: "HANDLER_NOT_FOUND",
          msg: "Handler not found",
          data: { method: ctx.req.method, path: ctx.req.path },
        });
      }

      // Find the first route that matches
      const match = routes
        .map((route) => ({ route, result: route.matcher(ctx.req.path) }))
        .find((m) => m.result !== false);

      if (!match || !match.result) {
        throw new CtxError({
          name: "HANDLER_NOT_FOUND",
          msg: "Handler not found",
          data: { method: ctx.req.method, path: ctx.req.path },
        });
      }

      // Merge path params into ctx.req.data
      ctx.req.data = { ...ctx.req.data, ...match.result.params };

      return await match.route.handler(ctx);
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
    const routes = this.routeObj[method] || (this.routeObj[method] = []);
    const matcher = pathMatch(path, { decode: decodeURIComponent });
    routes.push({
      pattern: path,
      matcher,
      handler,
    });
  }

  onErrorHook(handler: THooks["onError"]) {
    this.hooks.onError = handler;
  }
  onFinallyHook(handler: THooks["onFinally"]) {
    this.hooks.onFinally = handler;
  }
}
