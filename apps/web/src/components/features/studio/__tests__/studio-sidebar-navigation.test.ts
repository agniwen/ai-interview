import { describe, expect, it } from "vitest";
import {
  recruitingBoardStagePresets,
  resolveRecruitingBoardStagePreset,
} from "@app/shared/recruiting-board";
import {
  buildRecruitingBoardSearch,
  isStudioSidebarParentActive,
  STUDIO_SIDEBAR_SUBMENU_BUTTON_CLASS,
  shouldToggleStudioSidebarSubmenu,
} from "../studio-sidebar-slots";

describe("studio sidebar recruiting board presets", () => {
  it("exposes each top-level recruiting stage as a fixed board view", () => {
    expect(recruitingBoardStagePresets).toEqual([
      { id: "screening", label: "简历筛选", view: "screening:all" },
      { id: "interview", label: "面试", view: "interview:all" },
      { id: "offer", label: "Offer协商", view: "offer:all" },
      { id: "onboarding", label: "入职办理", view: "onboarding:all" },
      { id: "closed", label: "已结束", view: "closed:all" },
    ]);
  });

  it("only highlights a valid fixed sidebar preset", () => {
    expect(resolveRecruitingBoardStagePreset()).toBeUndefined();
    expect(resolveRecruitingBoardStagePreset("all")).toBeUndefined();
    expect(resolveRecruitingBoardStagePreset("interview")).toBe("interview");
    expect(resolveRecruitingBoardStagePreset("closed")).toBe("closed");
  });

  it("preserves normal recruiting filters while replacing the hidden preset", () => {
    expect(
      buildRecruitingBoardSearch(
        { boardPreset: "screening", page: 4, skills: "React", stage: "screening:all" },
        true,
        recruitingBoardStagePresets[1],
      ),
    ).toEqual({
      boardPreset: "interview",
      page: 1,
      skills: "React",
      stage: "interview:all",
    });
    expect(
      buildRecruitingBoardSearch(
        { boardPreset: "interview", page: 3, skills: "React", stage: "interview:all" },
        true,
      ),
    ).toEqual({ boardPreset: undefined, page: 1, skills: "React", stage: undefined });
    expect(
      buildRecruitingBoardSearch(
        { page: 9, search: "unrelated" },
        false,
        recruitingBoardStagePresets[4],
      ),
    ).toEqual({ boardPreset: "closed", page: 1, stage: "closed:all" });
  });

  it("deactivates the recruiting parent only while a submenu is selected", () => {
    expect(isStudioSidebarParentActive(true, true, "interview")).toBe(false);
    expect(isStudioSidebarParentActive(true, true)).toBe(true);
    expect(isStudioSidebarParentActive(true, false, "interview")).toBe(true);
    expect(isStudioSidebarParentActive(false, true, "interview")).toBe(false);
  });

  it("toggles from the whole parent row only when the recruiting parent is active", () => {
    expect(shouldToggleStudioSidebarSubmenu(true, true)).toBe(true);
    expect(shouldToggleStudioSidebarSubmenu(true, false)).toBe(false);
    expect(shouldToggleStudioSidebarSubmenu(false, true)).toBe(false);
    expect(shouldToggleStudioSidebarSubmenu(false, false)).toBe(false);
    expect(shouldToggleStudioSidebarSubmenu(true, true, true)).toBe(false);
  });

  it("never transitions an active submenu through a transparent hover background", () => {
    expect(STUDIO_SIDEBAR_SUBMENU_BUTTON_CLASS).toContain(
      "data-[active=false]:hover:bg-transparent!",
    );
    expect(STUDIO_SIDEBAR_SUBMENU_BUTTON_CLASS).not.toMatch(/(?:^|\s)hover:bg-transparent!/);
  });
});
