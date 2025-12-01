import express, { Request, Response } from "express";
import { toCtx } from "..";
import { router, TCtx } from "./router";

const app = express();

// Add body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getHttpCode(ctx: TCtx) {
  if (ctx.res.code === "OK") return 200;
  if (ctx.res.code === "UNKNOWN_ERROR") return 500;
  return 400;
}

app.all("/{*any}", async (req: Request, res: Response) => {
  router.logConsole("req:start");
  const ctx: TCtx = toCtx.fromExpress(req);
  router.start();
  await router.exec(ctx);
  ctx.meta.log.stdout = router.logGetRef() as string[];
  router.logConsole("req:end");
  await router.flushToStream(ctx);
  res.type("application/json").status(getHttpCode(ctx)).send(ctx.res);
});

app.listen(3001, () => {
  console.log(`Express server listening on port 3001`);
});
