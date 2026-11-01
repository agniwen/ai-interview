import { describe, expect, it } from "vitest";
import { resolveInterviewWorkspaceView } from "../studio-interviews-search";

describe("interview workspace views", () => {
  it("defaults to table and restores supported views from the URL", () => {
    expect(resolveInterviewWorkspaceView(undefined, true, true)).toBe("table");
    expect(resolveInterviewWorkspaceView("list", true, true)).toBe("list");
    expect(resolveInterviewWorkspaceView(["calendar"], true, true)).toBe("calendar");
    expect(resolveInterviewWorkspaceView("unknown", true, true)).toBe("table");
  });
  it("keeps the original table and calendar permission boundaries", () => {
    expect(resolveInterviewWorkspaceView("calendar", true, false)).toBe("table");
    expect(resolveInterviewWorkspaceView("list", true, false)).toBe("table");
    expect(resolveInterviewWorkspaceView("table", false, true)).toBe("list");
    expect(resolveInterviewWorkspaceView("calendar", false, true)).toBe("calendar");
  });
});
