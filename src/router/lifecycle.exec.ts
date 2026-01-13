import { TRoute, THooks } from "./types";
import { CtxError } from "./error";
import { TDefaultCtx } from "../core";
import { updateStatsIfStale } from "../common/helper";
import {
  TRouterInstance,
  getNextSeq,
  incrementInflight,
  decrementInflight,
} from "./instance";
import { STATS } from "../common/const";

/**
 * Executes a route handler with full lifecycle hooks.
 * Integrates begin/end logic internally for safe lifecycle management.
 *
 * @param ctx - The context to execute (created via createCtx())
 * @param routes - Array of registered routes
 * @param hooks - Hook functions to run during execution
 * @param instance - Router instance for metrics
 * @param statsEnabled - Whether to update CPU/memory stats (default: true)
 * @returns The updated context after execution
 */
export async function exec<TContext extends TDefaultCtx>(
  ctx: TContext,
  routes: TRoute<TContext>[],
  hooks: THooks<TContext>,
  instance: TRouterInstance,
  statsEnabled = true
): Promise<TContext> {
  // Update stats lazily (only during traffic, not on background timer)
  if (statsEnabled) {
    updateStatsIfStale();
  }

  // BEGIN LOGIC: Increment inflight, set seq and timing
  const inTime = Date.now();
  const seq = getNextSeq(instance);
  incrementInflight(instance);

  const traceId = `${instance.ID}-${seq}`;
  const spanId = `${instance.ID}-${seq}`;

  // Compute timing values using client timestamp if available
  const clientIn = ctx.req.invocation?.ts ?? inTime;
  const owd = inTime - clientIn;

  // Update context with begin values (replace entire meta object due to readonly properties)
  ctx.id = traceId;
  ctx.meta = {
    serviceName: ctx.meta.serviceName,
    instance: {
      id: instance.ID,
      createdAt: instance.CREATED_AT,
      seq,
      inflight: instance.INFLIGHT,
      cpu: STATS.cpu,
      mem: STATS.mem,
    },
    ts: {
      in: inTime,
      clientIn,
      out: -1,
      execTime: -1,
      owd,
    },
    monitor: {
      traceId,
      spanId,
    },
    ...(ctx.meta.log && { log: ctx.meta.log }),
  };

  // EXEC LIFECYCLE: Outer try/catch/finally
  try {
    // 1. EXEC BEFORE - Runs FIRST (context prep, before routing)
    await hooks.onExecBefore(ctx);

    // 2. Route matching (protocol-aware with action precedence)
    const protocol = ctx.req.transport?.protocol;
    const action = ctx.req.route.action;
    const hasAction = typeof action === "string" && action.length > 0;
    const original = ctx.req.route.original;

    // Find matching routes with protocol + action + pattern
    let exactMatch: {
      route: TRoute<TContext>;
      result: { params: object };
    } | null = null;
    let wildcardMatch: {
      route: TRoute<TContext>;
      result: { params: object };
    } | null = null;

    for (const route of routes) {
      // Protocol must match
      if (route.protocol !== protocol) continue;

      // Action matching rules:
      // - If route has action, require ctx action to match exactly
      // - If route has no action, it's a wildcard (matches any action)
      if (route.action !== undefined) {
        if (!hasAction || route.action !== action) continue;
      }

      // Pattern matching
      const result = route.matcher(original);
      if (result === false) continue;

      if (route.action !== undefined) {
        exactMatch = { route, result };
        break; // Exact action match wins, preserve registration order
      }

      if (!wildcardMatch) {
        wildcardMatch = { route, result };
      }
    }

    const match = exactMatch || wildcardMatch;

    if (!match) {
      throw new CtxError({
        name: "HANDLER_NOT_FOUND",
        msg: "Handler not found",
        data: {
          protocol: protocol || "unknown",
          action: hasAction ? action : "unknown",
          original,
        },
      });
    }

    // Update route to matched pattern (e.g., "/user/:userId")
    ctx.req.route.pattern = match.route.pattern;

    // Set route params (router no longer merges into ctx.req.data)
    ctx.req.params = match.result.params as Record<string, string>;

    // HANDLER LIFECYCLE: Inner try/catch/finally (around user's logic)
    try {
      // 3. HANDLER BEFORE
      await hooks.onHandlerBefore(ctx);

      // 4. USER'S BUSINESS LOGIC
      const result = await match.route.handler(ctx);

      // 5. HANDLER AFTER (success)
      await hooks.onHandlerAfter(result);
      ctx = result;
    } catch (handlerError) {
      // 6. HANDLER ERROR (handler-specific errors)
      ctx = await hooks.onHandlerError(ctx, handlerError);
    } finally {
      // 7. HANDLER FINALLY (always runs after handler)
      await hooks.onHandlerFinally(ctx);
    }

    // 8. EXEC AFTER - Runs at end of try block (after handler completes)
    await hooks.onExecAfter(ctx);
    return ctx;
  } catch (execError) {
    // 9. EXEC ERROR - Catches routing errors, HANDLER_NOT_FOUND, or re-thrown errors
    ctx = await hooks.onExecError(ctx, execError);
    return ctx;
  } finally {
    // 10. EXEC FINALLY - Always runs (cleanup, metrics)
    await hooks.onExecFinally(ctx);

    // END LOGIC: Set final timestamps and response meta, decrement inflight
    const outTime = Date.now();
    const execTime = outTime - ctx.meta.ts.in;

    // Replace ts object due to readonly properties
    ctx.meta.ts = {
      in: ctx.meta.ts.in,
      clientIn: ctx.meta.ts.clientIn,
      out: outTime,
      execTime,
      owd: ctx.meta.ts.owd,
    };

    const clientSeq = ctx.req.invocation?.seq || 0;
    ctx.res.meta = {
      ctxId: ctx.id,
      seq: Number.isInteger(clientSeq) ? clientSeq : -1,
      traceId: ctx.meta.monitor.traceId,
      spanId: ctx.meta.monitor.spanId,
      inTime: ctx.meta.ts.in,
      outTime,
      execTime,
      owd: ctx.meta.ts.owd,
    };

    decrementInflight(instance);
  }
}
