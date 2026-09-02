import type { Env as HonoEnv, Hono, Schema } from "hono";
import type { Env } from "./type";

export function attachBusinessRoutes<
  TApiEnv extends HonoEnv,
  TApiSchema extends Schema,
  TApiBasePath extends string,
>(
  app: Hono<Env>,
  apiRoutes: Hono<TApiEnv, TApiSchema, TApiBasePath>,
  plainPublicRoutes: Hono<Env>,
) {
  const routedApp = app.route("/api", apiRoutes);
  routedApp.route("/api/public", plainPublicRoutes);
  return routedApp;
}
