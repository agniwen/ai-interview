import { canAccessAdmin } from "@/lib/auth-roles";
import { factory } from "../factory";

// oxlint-disable-next-line require-await -- Hono middleware signature expects an async handler.
export const adminMiddleware = factory.createMiddleware(async (c, next) => {
  if (!c.var.user || !canAccessAdmin(c.var.user)) {
    return c.json({ message: "Forbidden" }, 403);
  }

  return next();
});
