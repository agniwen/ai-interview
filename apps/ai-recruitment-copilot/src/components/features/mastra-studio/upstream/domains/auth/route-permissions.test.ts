import { describe, expect, it } from "vitest";
import {
  getFirstAccessibleRoute,
  getPermissionForRoute,
  hasRoutePermission,
} from "./route-permissions";

describe("Studio route permissions", () => {
  it("inherits permissions for nested routes", () => {
    expect(getPermissionForRoute("/agents/example/chat/new")).toBe("agents:read");
    expect(getPermissionForRoute("/workflows/example/graph")).toBe("workflows:read");
  });

  it("keeps public and unknown routes accessible", () => {
    expect(hasRoutePermission("public", () => false, () => false)).toBe(true);
    expect(hasRoutePermission(undefined, () => false, () => false)).toBe(true);
  });

  it("redirects to the first permitted route or the public fallback", () => {
    expect(getFirstAccessibleRoute((permission) => permission === "workflows:read", () => false)).toBe(
      "/workflows",
    );
    expect(getFirstAccessibleRoute(() => false, () => false)).toBe("/resources");
  });
});
