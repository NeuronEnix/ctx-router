import { THooks, TRouteEntry, EXACT_KEY_DELIMITER } from "./types";
import { CtxBaseError, ctxRouterErr } from "./error";
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
 * @param exactRoutes - Map of exact route matches
 * @param paramRoutes - Array of parameterized routes
 * @param hooks - Hook functions to run during execution
 * @param instance - Router instance for metrics
 * @returns The updated context after execution
 */
export async function exec<TUserCtx extends TDefaultCtx>(
  ctx: TUserCtx,
  exactRoutes: Map<string, TRouteEntry<TUserCtx>>,
  paramRoutes: TRouteEntry<TUserCtx>[],
  hooks: THooks<TUserCtx>,
  instance: TRouterInstance
): Promise<TUserCtx> {
  // BEGIN LOGIC: Increment inflight, set seq and timing
  const inTime = Date.now();
  updateStatsIfStale(inTime);
  const seq = getNextSeq(instance);
  incrementInflight(instance);

  const traceId = `${instance.ID}-${seq}`;
  const spanId = `${instance.ID}-${seq}`;

  // Timing from caller hints; -1 (not a fake value) when unavailable
  const clientIn = ctx.req.caller?.ts ?? -1;
  const ingressIn = ctx.req.caller?.ingressIn ?? -1;
  const owd = clientIn === -1 ? -1 : inTime - clientIn;

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
      ingressIn,
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
    // Side-effect hook: mutates ctx in place, no return
    await hooks.onExecBefore?.(ctx);

    // 2. Route matching (protocol-agnostic, op + pattern based)
    const { op, raw } = ctx.req.route;
    const rawKey = op ? `${op} ${raw}` : raw; // For error messages

    // Try exact match first (O(1)): op-specific key, then op-less (wildcard)
    const exactMatch = op
      ? (exactRoutes.get(`${op}${EXACT_KEY_DELIMITER}${raw}`) ??
        exactRoutes.get(raw))
      : exactRoutes.get(raw);

    if (exactMatch) {
      // Exact match found - populate context and execute
      ctx.req.route.pattern = exactMatch.route.pattern;

      // 3. USER'S BUSINESS LOGIC
      ctx = await exactMatch.route.handler(ctx);

      // 4. EXEC AFTER - Runs at end of try block (after handler completes)
      await hooks.onExecAfter?.(ctx);
      return ctx;
    }

    // Try param pattern matches (regex)
    let decodeFailure: unknown;
    for (const entry of paramRoutes) {
      const route = entry.route;

      // 1. Check op (if route has op, context must match)
      if (route.op !== undefined) {
        if (!op || route.op !== op) continue;
      }

      // 2. Try pattern match. A decode failure (malformed percent-encoding
      // in a captured param) disqualifies this route; remember it so the
      // request fails explicitly if nothing else matches.
      let result: ReturnType<typeof route.matcher>;
      try {
        result = route.matcher(raw);
      } catch (matchError: unknown) {
        decodeFailure = matchError;
        continue;
      }
      if (result === false) continue;

      // Match found - populate context and execute
      // Merge matched params into req.data (params have lowest priority)
      const matchedParams = result.params as Record<string, string>;
      ctx.req.data = { ...matchedParams, ...ctx.req.data };
      ctx.req.route.pattern = route.pattern;

      // 3. USER'S BUSINESS LOGIC
      ctx = await route.handler(ctx);

      // 4. EXEC AFTER - Runs at end of try block (after handler completes)
      await hooks.onExecAfter?.(ctx);
      return ctx;
    }

    // No match found. If a matcher failed to decode the path, surface that
    // explicitly (client error) instead of a generic not-found.
    if (decodeFailure !== undefined) {
      throw ctxRouterErr.handler.MALFORMED_ROUTE_PATH({
        data: { route: rawKey },
        info: {
          cause:
            decodeFailure instanceof Error
              ? decodeFailure.message
              : String(decodeFailure),
        },
      });
    }
    throw ctxRouterErr.handler.HANDLER_NOT_FOUND({
      msg: `Handler not found for route: ${rawKey}`,
      data: {
        route: rawKey,
      },
    });
  } catch (execError: unknown) {
    // 9. EXEC ERROR - Catches routing errors, HANDLER_NOT_FOUND, or re-thrown errors
    // Normalize to a CtxBaseError so ctx.err is always structured
    const normalizedErr =
      execError instanceof CtxBaseError
        ? execError
        : ctxRouterErr.general.UNKNOWN_ERROR({
            info: {
              cause:
                execError instanceof Error
                  ? `${execError.name}: ${execError.message}`
                  : String(execError),
            },
          });
    ctx.err = normalizedErr;

    // Side-effect hook: mutates ctx in place, no return
    if (hooks.onExecError) {
      // Pre-fill the response so a swallowed error can never go out as "OK";
      // the hook may override any of these
      ctx.res.code = normalizedErr.name;
      ctx.res.msg = normalizedErr.message;
      ctx.res.data = normalizedErr.data;
      await hooks.onExecError(ctx, execError);
      return ctx;
    }

    // If user did not register an error hook, re-throw the error (fail fast).
    throw execError;
  } finally {
    // END LOGIC: Set final timestamps and response meta, decrement inflight
    const outTime = Date.now();
    const execTime = outTime - ctx.meta.ts.in;

    // Replace ts object due to readonly properties
    ctx.meta.ts = {
      in: ctx.meta.ts.in,
      clientIn: ctx.meta.ts.clientIn,
      ingressIn: ctx.meta.ts.ingressIn,
      out: outTime,
      execTime,
      owd: ctx.meta.ts.owd,
    };

    decrementInflight(instance);
    await hooks.onExecFinally?.(ctx);
  }
}
