import { describe, expect, it } from "vitest";
import {
  recruitingBoardStagePresets,
  resolveRecruitingBoardStagePreset,
} from "@app/shared/recruiting-board";
import {
  buildRecruitingBoardSearch,
  isStudioSidebarParentActive,
  shouldToggleStudioSidebarSubmenu,
} from "../studio-sidebar-slots";

/** 停在招聘台列表页时的父级点击判定。 */
const toggles = (isRecruitingBoard: boolean, isParentActive: boolean, modifiedNavigation = false) =>
  shouldToggleStudioSidebarSubmenu({
    isParentActive,
    isRecruitingBoard,
    modifiedNavigation,
    onListPage: true,
  });

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
    const nextSearch = buildRecruitingBoardSearch(
      {
        boardPreset: "screening",
        dashboardAction: "ai_pending",
        page: 4,
        skills: "React",
        stage: "screening:all",
      },
      true,
      recruitingBoardStagePresets[1],
    );
    expect(nextSearch).toEqual({
      boardPreset: "interview",
      page: 1,
      skills: "React",
      stage: "interview:all",
    });
    expect(nextSearch).not.toHaveProperty("dashboardAction");
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
    expect(toggles(true, true)).toBe(true);
    expect(toggles(true, false)).toBe(false);
    expect(toggles(false, true)).toBe(false);
    expect(toggles(false, false)).toBe(false);
    expect(toggles(true, true, true)).toBe(false);
  });

  it("navigates back to the board instead of toggling from a candidate detail page", () => {
    expect(
      shouldToggleStudioSidebarSubmenu({
        isParentActive: true,
        isRecruitingBoard: true,
        onListPage: false,
      }),
    ).toBe(false);
  });
});
