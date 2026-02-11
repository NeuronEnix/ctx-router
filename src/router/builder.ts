import type { TDefaultCtx } from "../core";
import type { TMiddleware } from "./types";
import { ctxRouterErr } from "./error";
import type { CtxRouter } from "./router";

export type TRouteBuilder<TUserCTx extends TDefaultCtx> = {
  /**
   * Adds a segment to the route identity.
   *
   * Examples:
   * - route("user").route(":id").route("detail") -> "user.:id.detail"
   * - route("GET /user/:id") -> "/user/:id" + method op = GET
   */
  route(segment: string): TRouteBuilder<TUserCTx>;

  /**
   * Adds middleware to the pipeline for this route scope.
   * Middleware runs in the order it is registered (first via -> last via -> handler).
   */
  via(...fns: Array<TMiddleware<TUserCTx>>): TRouteBuilder<TUserCTx>;

  /**
   * Registers the terminal handler for this route. Ends the chain.
   */
  to(handler: TMiddleware<TUserCTx>): void;
};

/**
 * Immutable builder used only for build-time DSL (`route/via/to`).
 * It holds accumulated segments + middleware and registers into the owning router.
 */
export class RouteBuilder<TUserCtx extends TDefaultCtx>
  implements TRouteBuilder<TUserCtx>
{
  constructor(
    private readonly router: CtxRouter<TUserCtx>,
    private readonly segments: string[],
    private readonly middleware: Array<TMiddleware<TUserCtx>>
  ) {}

  route(segment: string): RouteBuilder<TUserCtx> {
    if (typeof segment !== "string" || segment.length === 0) {
      throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
    }
    return new RouteBuilder<TUserCtx>(
      this.router,
      [...this.segments, segment],
      [...this.middleware]
    );
  }

  via(...fns: Array<TMiddleware<TUserCtx>>): RouteBuilder<TUserCtx> {
    for (const fn of fns) {
      if (typeof fn !== "function") {
        throw ctxRouterErr.router.INVALID_MIDDLEWARE();
      }
    }
    return new RouteBuilder<TUserCtx>(
      this.router,
      [...this.segments],
      [...this.middleware, ...fns]
    );
  }

  to(handler: TMiddleware<TUserCtx>): void {
    if (typeof handler !== "function") {
      throw ctxRouterErr.router.INVALID_HANDLER();
    }
    this.router.registerRouteFrom(this.segments, this.middleware, handler);
  }
}
