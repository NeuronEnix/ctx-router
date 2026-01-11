import express, { Request, Response } from "express";
import { adapter } from "ctx-router";
import { router, TCtx } from "./router";

const app = express();

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register alterContext hook for custom context modifications
router.hookAlterContext(async (ctx) => {
  // Demonstrate hook functionality by logging
  console.log(
    `[alterContext] Processing request ${ctx.id} - ${ctx.req.routeValue}`
  );
  return ctx;
});

function getHttpCode(ctx: TCtx) {
  if (ctx.res.code === "OK") return 200;
  if (ctx.res.code === "UNKNOWN_ERROR") return 500;
  return 400;
}

app.use(async (req: Request, res: Response) => {
  // 1. Begin request lifecycle - creates context, increments INFLIGHT & SEQ
  const ctx: TCtx = router.begin();
  console.log(
    `[1. Begin] ID: ${ctx.id}, SEQ: ${ctx.meta.instance.seq}, INFLIGHT: ${ctx.meta.instance.inflight}`
  );

  // 2. Enrich context with Express request data
  adapter.enrichFromExpress(ctx, req);
  console.log(`[2. Enriched] RouteValue: ${ctx.req.routeValue}`);

  // 3. Execute route handler (with hooks)
  await router.exec(ctx);
  console.log(`[3. Executed] ${ctx.res.code}`);

  // 4. End request lifecycle - finalizes context, decrements INFLIGHT
  router.end(ctx);
  console.log(
    `[4. End] INFLIGHT after: ${router.INSTANCE.INFLIGHT}\n`
  );

  // 5. Send response
  res.type("application/json").status(getHttpCode(ctx)).send(ctx.res);
});

app.listen(3001, () => {
  console.log(`Express server listening on port 3001`);
  console.log(`Router INSTANCE ID: ${router.INSTANCE.ID}`);
  console.log(`Router INSTANCE Created: ${new Date(router.INSTANCE.CREATED_AT).toISOString()}`);
  console.log(`Service Name: ${router.INSTANCE.SERVICE_NAME}\n`);
});
