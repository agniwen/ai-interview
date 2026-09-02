import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "./type";
import { attachBusinessRoutes } from "./routing";

describe("attachBusinessRoutes", () => {
  it("keeps existing public endpoints reachable beside the human interview review board", async () => {
    const apiRoutes = new Hono<Env>().get("/public/existing", (c) =>
      c.json({ source: "existing" }, 200),
    );
    const reviewRouter = new Hono<Env>().get("/review", (c) => c.json({ source: "review" }, 200));

    const app = attachBusinessRoutes(new Hono<Env>(), apiRoutes, reviewRouter);

    const existing = await app.request("/api/public/existing");
    expect(existing.status).toBe(200);
    await expect(existing.json()).resolves.toEqual({ source: "existing" });

    const review = await app.request("/api/public/review");
    expect(review.status).toBe(200);
    await expect(review.json()).resolves.toEqual({ source: "review" });
  });
});
