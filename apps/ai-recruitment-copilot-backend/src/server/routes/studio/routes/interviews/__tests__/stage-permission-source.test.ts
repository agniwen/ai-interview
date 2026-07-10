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
    expect(routeSource).toContain(
      '"/human-interview-meetings",\n    requirePermission("humanInterview", "read")',
    );
    expect(routeSource).toContain(
      '"/human-interview-meetings",\n    requirePermission("humanInterview", "create")',
    );
    expect(routeSource).toContain(
      '.post(\n    "/:id/human-interview-rounds",\n    requirePermission("humanInterview", "create")',
    );
    expect(routeSource).toContain(
      '.patch(\n    "/:id/human-interview-rounds/:roundId",\n    requirePermission("humanInterview", "update")',
    );
    expect(routeSource).toContain(
      '.delete(\n    "/human-interview-meetings/:meetingId",\n    requirePermission("humanInterview", "delete")',
    );
    expect(routeSource).toContain(
      '.post(\n    "/:id/human-interview-rounds/:roundId/cancel",\n    requirePermission("humanInterview", "delete")',
    );
    expect(routeSource).not.toContain('requirePermission("humanInterview", "manage")');
  });
});
