import type { TDefaultCtx } from "../core";
import type { TMiddleware } from "./types";
import { ctxRouterErr } from "./error";
import type { CtxRouter } from "./router";

export type TRouteBuilder<TUserContext extends TDefaultCtx> = {
  /**
   * Adds a segment to the route identity.
   *
   * Examples:
   * - route("user").route(":id").route("detail") -> "user.:id.detail"
   * - route("GET /user/:id") -> "/user/:id" + method op = GET
   */
  route(segment: string): TRouteBuilder<TUserContext>;

  /**
   * Adds middleware to the pipeline for this route scope.
   * Middleware runs in the order it is registered (first via -> last via -> handler).
   */
  via(...fns: Array<TMiddleware<TUserContext>>): TRouteBuilder<TUserContext>;

  /**
   * Registers the terminal handler for this route. Ends the chain.
   */
  to(handler: TMiddleware<TUserContext>): void;
};

/**
 * Immutable builder used only for build-time DSL (`route/via/to`).
 * It holds accumulated segments + middleware and registers into the owning router.
 */
export class RouteBuilder<TUserContext extends TDefaultCtx>
  implements TRouteBuilder<TUserContext>
{
  constructor(
    private readonly router: CtxRouter<TUserContext>,
    private readonly segments: string[],
    private readonly middleware: Array<TMiddleware<TUserContext>>
  ) {}

  route(segment: string): RouteBuilder<TUserContext> {
    if (typeof segment !== "string" || segment.length === 0) {
      throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
    }
    return new RouteBuilder<TUserContext>(
      this.router,
      [...this.segments, segment],
      [...this.middleware]
    );
  }

  via(...fns: Array<TMiddleware<TUserContext>>): RouteBuilder<TUserContext> {
    for (const fn of fns) {
      if (typeof fn !== "function") {
        throw ctxRouterErr.router.INVALID_MIDDLEWARE();
      }
    }
    return new RouteBuilder<TUserContext>(
      this.router,
      [...this.segments],
      [...this.middleware, ...fns]
    );
  }

  to(handler: TMiddleware<TUserContext>): void {
    if (typeof handler !== "function") {
      throw ctxRouterErr.router.INVALID_HANDLER();
    }
    this.router.registerRouteFrom(this.segments, this.middleware, handler);
  }
}
