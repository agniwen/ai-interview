import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const collectionRouteSource = readFileSync(
  new URL("../collection-route.ts", import.meta.url),
  "utf-8",
);
const detailRouteSource = readFileSync(new URL("../detail-route.ts", import.meta.url), "utf-8");
const humanRouteSource = readFileSync(new URL("../human-route.ts", import.meta.url), "utf-8");
const routeSource = `${collectionRouteSource}\n${detailRouteSource}\n${humanRouteSource}`;

describe("late-stage route permissions", () => {
  it("splits human interview routes by CRUD permissions", () => {
    const expectPermission = (path: string, action: string) => {
      const pathLiteral = `"${path}"`;
      const permission = new RegExp(
        `(?:requirePermission|permission)\\("humanInterview", "${action}"\\)`,
      );
      let pathIndex = routeSource.indexOf(pathLiteral);
      let matched = false;
      while (pathIndex >= 0) {
        if (permission.test(routeSource.slice(pathIndex, pathIndex + 320))) {
          matched = true;
          break;
        }
        pathIndex = routeSource.indexOf(pathLiteral, pathIndex + pathLiteral.length);
      }
      expect(matched).toBe(true);
    };

    expectPermission("/human-interview-meetings", "read");
    expectPermission("/human-interview-meetings", "create");
    expectPermission("/:id/human-interview-rounds", "create");
    expectPermission("/:id/human-interview-rounds/:roundId", "update");
    expectPermission("/human-interview-meetings/:meetingId", "delete");
    expectPermission("/:id/human-interview-rounds/:roundId/cancel", "delete");
    expect(routeSource).not.toContain('requirePermission("humanInterview", "manage")');
    expect(routeSource).not.toContain('permission("humanInterview", "manage")');
  });
});
