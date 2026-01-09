import crypto from "crypto";
import { defaultHookBeforeExec } from "./defaultHook/hook.beforeExec";
import { defaultHookExecError } from "./defaultHook/hook.onError";
import { CtxError } from "./error";
import { TDefaultCtx, CtxUser } from "./core";
import { match as pathMatch, MatchFunction } from "path-to-regexp";

type TRoute<TContext extends TDefaultCtx> = {
  pattern: string;
  matcher: MatchFunction<object>;
  handler: (ctx: TContext) => Promise<TContext>;
};

type THooks = {
  beforeExec<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  afterExec<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
  alterContext<TContext extends TDefaultCtx>(ctx: TContext): Promise<TContext>;
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
  private routes: TRoute<TContext>[] = [];
  private hooks: THooks;
  public logLevel: LogLevel;

  // Router-level INSTANCE
  private readonly instance = {
    ID: crypto.randomBytes(5).toString("hex"),
    TRACE_ID: crypto.randomBytes(5).toString("hex"),
    CREATED_AT: Date.now(),
    SERVICE_NAME: process.env["SERVICE_NAME"] || "my-service",
    SEQ: 0,
    INFLIGHT: 0,
    LAST_HEARTBEAT: Date.now(),
    PORT: parseInt(process.env["SERVICE_PORT"] || "3000", 10),
  };

  // Public readonly getter
  public get INSTANCE() {
    return { ...this.instance };
  }

  // Private helper methods
  private incrementInflight(): number {
    return ++this.instance.INFLIGHT;
  }

  private decrementInflight(): number {
    return --this.instance.INFLIGHT;
  }

  private getNextSeq(): number {
    return ++this.instance.SEQ;
  }

  constructor(config: CtxRouterConfig = {}) {
    this.logLevel = config.logLevel ?? "standard";
    this.hooks = {
      beforeExec: defaultHookBeforeExec(this.logLevel),
      afterExec: async (ctx) => ctx,
      alterContext: async (ctx) => ctx,
      execError: defaultHookExecError,
      execFinally: async (ctx) => {
        // Inline doneCtx logic
        ctx.meta.ts.out = Date.now();
        ctx.meta.ts.execTime = ctx.meta.ts.out - ctx.meta.ts.in;

        // Set response meta
        const meta = ctx.meta;
        const clientSeq = ctx.req.invocation?.seq || 0;
        ctx.res.meta = {
          ctxId: ctx.id,
          seq: Number.isInteger(clientSeq) ? clientSeq : 0,
          traceId: meta.monitor.traceId,
          spanId: meta.monitor.spanId,
          inTime: meta.ts.in,
          outTime: meta.ts.out,
          execTime: meta.ts.execTime,
          owd: meta.ts.owd,
        };

        // Decrement inflight
        this.decrementInflight();

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

  hookAlterContext(handler: THooks["alterContext"]) {
    this.hooks.alterContext = handler;
  }

  /**
   * Creates a new context with default values and router INSTANCE data.
   * Increments INFLIGHT counter.
   *
   * Usage:
   *   const ctx = router.getNewCtx();
   *   enrichFromExpress(ctx, req);
   *   await router.exec(ctx);
   */
  public getNewCtx(): TContext {
    const inTime = Date.now();
    const seq = this.getNextSeq();
    this.incrementInflight();

    const traceId = `${this.instance.ID}-${seq}`;
    const spanId = `${this.instance.ID}-${seq}`;

    // Build default user (anonymous)
    const user: CtxUser = {
      kind: "user",
      id: "none",
      role: ["none"],
      scope: [],
      handle: null,
    };

    // Build ctx with defaults
    const ctx: TDefaultCtx = {
      id: traceId,
      req: {
        data: {},
        route: "PENDING", // Adapter will set
        routePattern: "PENDING", // Router will set in exec
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
          seq,
          inflight: this.instance.INFLIGHT,
          cpu: 0,
          mem: 0,
        },
        ts: {
          in: inTime,
          clientIn: inTime,
          out: 0,
          execTime: 0,
          owd: 0,
        },
        monitor: {
          traceId,
          spanId,
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
    try {
      // Call alterContext hook first (for user customizations)
      await this.hooks.alterContext(ctx);

      await this.hooks.beforeExec(ctx);

      // Find matching route (protocol-agnostic)
      const match = this.routes
        .map((route) => ({
          route,
          result: route.matcher(ctx.req.routePattern),
        }))
        .find((m) => m.result !== false);

      if (!match || !match.result) {
        throw new CtxError({
          name: "HANDLER_NOT_FOUND",
          msg: "Handler not found",
          data: { routePattern: ctx.req.routePattern },
        });
      }

      // Update routePattern to matched pattern (e.g., "GET /user/:userId")
      ctx.req.routePattern = match.route.pattern;

      // Merge route params into ctx.req.data
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

  handle(route: string, handler: (ctx: TContext) => Promise<TContext>) {
    const matcher = pathMatch(route, { decode: decodeURIComponent });
    this.routes.push({
      pattern: route,
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
