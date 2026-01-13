import express, { Request, Response } from "express";
import { adapter } from "ctx-router";
import { router, TCtx } from "./router";

const app = express();

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register exec before hook for custom context modifications
router.hookOnExecBefore(async (ctx) => {
  // Demonstrate hook functionality by logging
  console.log(
    `[onExecBefore] Processing request ${ctx.id} - ${ctx.req.routeValue}`
  );
  return ctx;
});

function getHttpCode(ctx: TCtx) {
  if (ctx.res.code === "OK") return 200;
  if (ctx.res.code === "UNKNOWN_ERROR") return 500;
  return 400;
}

app.use(async (req: Request, res: Response) => {
  // 1. Create context with default values (no side effects)
  const ctx: TCtx = router.createCtx();
  console.log(`[1. createCtx] Created context with ID: ${ctx.id}`);

  // 2. Enrich context with Express request data
  adapter.enrichFromExpress(ctx, req, res);
  console.log(`[2. Enriched] RouteValue: ${ctx.req.routeValue}`);

  // 3. Execute route handler (begins lifecycle, runs hooks, ends lifecycle)
  await router.exec(ctx);
  console.log(
    `[3. Executed] ${ctx.res.code}, ID: ${ctx.id}, SEQ: ${ctx.meta.instance.seq}, INFLIGHT: ${router.INSTANCE.INFLIGHT}\n`
  );

  // 4. Send response
  res.type("application/json").status(getHttpCode(ctx)).send(ctx.res);
});

app.listen(3001, () => {
  console.log(`Express server listening on port 3001`);
  console.log(`Router INSTANCE ID: ${router.INSTANCE.ID}`);
  console.log(`Router INSTANCE Created: ${new Date(router.INSTANCE.CREATED_AT).toISOString()}`);
  console.log(`Service Name: ${router.INSTANCE.SERVICE_NAME}\n`);
});
