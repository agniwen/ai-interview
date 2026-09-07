import { describe, expect, it } from "vitest";
import { parseSidebarInitialState } from "./sidebar-persistence";

describe("parseSidebarInitialState", () => {
  it("parses valid sidebar preferences for the server render", () => {
    expect(
      parseSidebarInitialState(
        "false",
        encodeURIComponent(JSON.stringify({ "/studio/resumes": false })),
      ),
    ).toEqual({
      menuOpen: { "/studio/resumes": false },
      open: false,
    });
  });

  it("falls back safely for missing or malformed cookies", () => {
    expect(parseSidebarInitialState()).toEqual({ menuOpen: {}, open: true });
    expect(parseSidebarInitialState("unexpected", "%not-json")).toEqual({
      menuOpen: {},
      open: true,
    });
  });

  it("drops invalid submenu values without discarding valid entries", () => {
    expect(
      parseSidebarInitialState(
        "true",
        encodeURIComponent(JSON.stringify({ "/studio/resumes": true, invalid: "false" })),
      ),
    ).toEqual({
      menuOpen: { "/studio/resumes": true },
      open: true,
    });
  });
});
