import { factory } from "../factory";

// oxlint-disable-next-line require-await -- Hono middleware signature expects an async handler.
export const authMiddleware = factory.createMiddleware(async (c, next) => {
  if (!c.var.user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  return next();
});
