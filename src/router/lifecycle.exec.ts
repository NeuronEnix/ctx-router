import { TRoute, THooks } from "./types";
import { CtxError } from "./error";
import { TDefaultCtx } from "../core";

/**
 * Executes a route handler with full lifecycle hooks.
 *
 * This is the second step in the three-phase request lifecycle:
 * 1. begin() - Create context, increment metrics
 * 2. exec() - Execute route handler
 * 3. end() - Finalize context, decrement metrics
 *
 * @param ctx - The context to execute
 * @param routes - Array of registered routes
 * @param hooks - Hook functions to run during execution
 * @returns The updated context after execution
 */
export async function exec<TContext extends TDefaultCtx>(
  ctx: TContext,
  routes: TRoute<TContext>[],
  hooks: THooks
): Promise<TContext> {
  // EXEC LIFECYCLE: Outer try/catch/finally
  try {
    // 1. EXEC BEFORE - Runs FIRST (context prep, before routing)
    await hooks.onExecBefore(ctx);

    // 2. Route matching (router logic)
    const match = routes
      .map((route) => ({
        route,
        result: route.matcher(ctx.req.routeValue),
      }))
      .find((m) => m.result !== false);

    if (!match || !match.result) {
      throw new CtxError({
        name: "HANDLER_NOT_FOUND",
        msg: "Handler not found",
        data: { routeValue: ctx.req.routeValue },
      });
    }

    // Update route to matched pattern (e.g., "GET /user/:userId")
    ctx.req.route = match.route.pattern;

    // Merge route params into ctx.req.data
    ctx.req.data = { ...ctx.req.data, ...match.result.params };

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
    return await hooks.onExecError(ctx, execError);
  } finally {
    // 10. EXEC FINALLY - Always runs (cleanup, metrics)
    await hooks.onExecFinally(ctx);
  }
}
