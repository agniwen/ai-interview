import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const platformRouteSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
const mastraRouteSource = readFileSync(
  new URL("../routes/mastra/route.ts", import.meta.url),
  "utf-8",
);

describe("platform Mastra route boundary", () => {
  it("mounts Mastra after the platform administrator middleware", () => {
    const adminMiddlewareIndex = platformRouteSource.indexOf(".use(adminMiddleware)");
    const mastraRouteIndex = platformRouteSource.indexOf('.route("/mastra", platformMastraRouter)');

    expect(adminMiddlewareIndex).toBeGreaterThan(-1);
    expect(mastraRouteIndex).toBeGreaterThan(adminMiddlewareIndex);
  });

  it("initializes the Hono adapter with the production Mastra singleton", () => {
    expect(mastraRouteSource).toContain("server/agents/mastra/index");
    expect(mastraRouteSource).toContain("new MastraServer");
    expect(mastraRouteSource).toContain('prefix: "/"');
  });
});
