import { defaultHookBeforeExec } from "./defaultHook/hook.beforeExec";
import { defaultHookExecError } from "./defaultHook/hook.onError";
import { CtxError } from "./error";
import { TDefaultCtx } from "./core";
import { match as pathMatch, MatchFunction } from "path-to-regexp";
import { doneCtx } from "./adapter";

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
  afterExec<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  execError<TContext extends TDefaultCtx>(
    ctx: TContext,
    error: CtxError | Error | unknown
  ): Promise<TContext>;
  execFinally<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
};

export type LogLevel = "none" | "minimal" | "standard" | "verbose";

type CtxRouterConfig = {
  logLevel?: LogLevel;
};

export class CtxRouter<TContext extends TDefaultCtx> {
  private routeObj: TRouteObj<TContext> = {};
  private hooks: THooks;
  public logLevel: LogLevel;

  constructor(config: CtxRouterConfig = {}) {
    this.logLevel = config.logLevel ?? "standard";
    this.hooks = {
      beforeExec: defaultHookBeforeExec(this.logLevel),
      afterExec: async (ctx) => ctx,
      execError: defaultHookExecError,
      execFinally: async (ctx) => {
        await doneCtx(ctx);
        return ctx;
      },
    };
  }

  hookBeforeExec(handler: THooks["beforeExec"]) {
    this.hooks.beforeExec = handler;
  }

  hookAfterExec(handler: THooks["afterExec"]) {
    this.hooks.afterExec = handler;
  }

  async exec(ctx: TContext): Promise<TContext> {
    try {
      await this.hooks.beforeExec(ctx);

      // Extract method and path from routePattern (e.g., "GET /user/123")
      const spaceIndex = ctx.req.routePattern.indexOf(" ");
      const method =
        spaceIndex > 0 ? ctx.req.routePattern.substring(0, spaceIndex) : "GET";
      const path =
        spaceIndex > 0
          ? ctx.req.routePattern.substring(spaceIndex + 1)
          : ctx.req.routePattern;

      // Find matching route
      const routes = this.routeObj[method];
      if (!routes) {
        throw new CtxError({
          name: "HANDLER_NOT_FOUND",
          msg: "Handler not found",
          data: { routePattern: ctx.req.routePattern },
        });
      }

      // Find the first route that matches
      const match = routes
        .map((route) => ({ route, result: route.matcher(path) }))
        .find((m) => m.result !== false);

      if (!match || !match.result) {
        throw new CtxError({
          name: "HANDLER_NOT_FOUND",
          msg: "Handler not found",
          data: { routePattern: ctx.req.routePattern },
        });
      }

      // Update routePattern to matched pattern (e.g., "GET /user/:userId")
      ctx.req.routePattern = `${method} ${match.route.pattern}`;

      // route stays as-is (actual path with values, e.g., "GET /user/123")

      // Merge path params into ctx.req.data
      ctx.req.data = { ...ctx.req.data, ...match.result.params };

      const result = await match.route.handler(ctx);
      await this.hooks.afterExec(result);
      return result;
    } catch (error) {
      return await this.hooks.execError(ctx, error);
    } finally {
      await this.hooks.execFinally(ctx);
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

  hookExecError(handler: THooks["execError"]) {
    this.hooks.execError = handler;
  }
  hookExecFinally(handler: THooks["execFinally"]) {
    this.hooks.execFinally = handler;
  }
}
