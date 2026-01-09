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
    `[alterContext] Processing request ${ctx.id} - ${ctx.req.route}`
  );
  return ctx;
});

function getHttpCode(ctx: TCtx) {
  if (ctx.res.code === "OK") return 200;
  if (ctx.res.code === "UNKNOWN_ERROR") return 500;
  return 400;
}

app.use(async (req: Request, res: Response) => {
  // 1. Router creates context with INSTANCE data (increments INFLIGHT)
  const ctx: TCtx = router.getNewCtx();
  console.log(
    `[1. Created] ID: ${ctx.id}, SEQ: ${ctx.meta.instance.seq}, INFLIGHT: ${ctx.meta.instance.inflight}`
  );

  // 2. Adapter enriches with Express request data
  adapter.enrichFromExpress(ctx, req);
  console.log(`[2. Enriched] Route: ${ctx.req.route}`);

  // 3. Optional: Manual context modifications (or use alterContext hook)
  // The alterContext hook is called automatically if registered
  // ctx.meta.customField = "value";

  // 4. Execute route (decrements INFLIGHT in execFinally)
  await router.exec(ctx);

  // 5. Log final state and send response
  console.log(
    `[5. Completed] ${ctx.res.code} - INFLIGHT after: ${router.INSTANCE.INFLIGHT}\n`
  );
  res.type("application/json").status(getHttpCode(ctx)).send(ctx.res);
});

app.listen(3001, () => {
  console.log(`Express server listening on port 3001`);
  console.log(`Router INSTANCE ID: ${router.INSTANCE.ID}`);
  console.log(`Router INSTANCE Created: ${new Date(router.INSTANCE.CREATED_AT).toISOString()}`);
  console.log(`Service Name: ${router.INSTANCE.SERVICE_NAME}\n`);
});
