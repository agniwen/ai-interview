import { describe, expect, it } from "vitest";
import { resolveRecruitingWorkspaceView } from "./recruiting-workspace-view";

describe("recruiting workspace view permissions", () => {
  it.each(["hr", "records", "jobs", "dashboard"] as const)(
    "preserves the requested %s view when both permissions are granted",
    (view) => {
      expect(resolveRecruitingWorkspaceView(view, true, true)).toBe(view);
    },
  );

  it("falls back to HR statistics when the dashboard is not allowed", () => {
    expect(resolveRecruitingWorkspaceView("dashboard", true, false)).toBe("hr");
  });

  it.each(["hr", "records", "jobs"] as const)(
    "opens the dashboard instead of %s for a dashboard-only member",
    (view) => {
      expect(resolveRecruitingWorkspaceView(view, false, true)).toBe("dashboard");
    },
  );

  it.each(["hr", "records", "jobs", "dashboard"] as const)(
    "does not select %s or any fallback without page access",
    (view) => {
      expect(resolveRecruitingWorkspaceView(view, false, false)).toBeNull();
    },
  );
});
