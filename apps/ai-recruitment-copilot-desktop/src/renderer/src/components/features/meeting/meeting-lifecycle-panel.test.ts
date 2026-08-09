import { describe, expect, it } from "vitest";
import { canManageMeetingLifecycle } from "./meeting-lifecycle-panel";

describe("Meeting lifecycle panel", () => {
  it("allows only the Meeting Owner and Workspace administrator to lifecycle-delete", () => {
    expect(canManageMeetingLifecycle("owner")).toBe(true);
    expect(canManageMeetingLifecycle("administrator")).toBe(true);
    expect(canManageMeetingLifecycle("editor")).toBe(false);
    expect(canManageMeetingLifecycle("viewer")).toBe(false);
  });
});
