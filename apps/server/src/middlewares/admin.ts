import { factory } from "../factory";

// oxlint-disable-next-line require-await -- Hono middleware signature expects an async handler.
export const adminMiddleware = factory.createMiddleware(async (c, next) => {
  const { user } = c.var;
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ message: "Forbidden" }, 403);
  }
  return next();
});
