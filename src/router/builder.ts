import type { TDefaultCtx } from "../core";
import type { TMiddleware } from "./types";
import { ctxRouterErr } from "./error";
import type { CtxRouter } from "./router";
import { INTERNAL_ROUTER_ACCESS } from "./router";

export type TRouteBuilder<TUserCTx extends TDefaultCtx> = {
  /**
   * Adds a segment to the route identity.
   *
   * Examples:
   * - route("user.").route(":id").route(".detail") -> "user.:id.detail"
   * - route("/user").route("/:id") -> "/user/:id"
   * - route("/user", "user").route("GET /:id", ".:id") -> 2x2 combinations
   * - route("GET /user/:id") -> "/user/:id" + method op = GET
   *
   * Note: segments are concatenated exactly as provided. Delimiters are user-defined.
   */
  route(...segments: string[]): TRouteBuilder<TUserCTx>;

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
    private readonly segmentVariants: string[][],
    private readonly middleware: Array<TMiddleware<TUserCtx>>
  ) {}

  route(...segments: string[]): RouteBuilder<TUserCtx> {
    if (segments.length === 0) {
      throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
    }

    for (const segment of segments) {
      if (typeof segment !== "string" || segment.length === 0) {
        throw ctxRouterErr.router.INVALID_ROUTE_SEGMENT();
      }
    }

    const nextVariants: string[][] = [];
    for (const baseVariant of this.segmentVariants) {
      for (const segment of segments) {
        nextVariants.push([...baseVariant, segment]);
      }
    }

    return new RouteBuilder<TUserCtx>(this.router, nextVariants, [
      ...this.middleware,
    ]);
  }

  via(...fns: Array<TMiddleware<TUserCtx>>): RouteBuilder<TUserCtx> {
    for (const fn of fns) {
      if (typeof fn !== "function") {
        throw ctxRouterErr.router.INVALID_MIDDLEWARE();
      }
    }
    return new RouteBuilder<TUserCtx>(
      this.router,
      [...this.segmentVariants],
      [...this.middleware, ...fns]
    );
  }

  to(handler: TMiddleware<TUserCtx>): void {
    if (typeof handler !== "function") {
      throw ctxRouterErr.router.INVALID_HANDLER();
    }
    for (const segments of this.segmentVariants) {
      this.router[INTERNAL_ROUTER_ACCESS].registerRouteFrom(
        segments,
        this.middleware,
        handler
      );
    }
  }
}
