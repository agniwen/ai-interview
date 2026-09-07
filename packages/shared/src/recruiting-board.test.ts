import { describe, expect, it } from "vitest";
import {
  getRecruitingBoardGroup,
  getRecruitingBoardPageTitle,
  getRecruitingBoardPresetStatusTabs,
  getRecruitingBoardViewLabel,
  recruitingBoardAllTabs,
  recruitingBoardGroups,
  recruitingBoardViewSchema,
  resolveRecruitingBoardPresetView,
  resolveRecruitingBoardFilterView,
  resolveRecruitingBoardView,
} from "./recruiting-board";

describe("招聘台全部及阶段标签", () => {
  it("默认全部，保留旧节点链接", () => {
    expect(resolveRecruitingBoardView()).toBe("all");
    expect(resolveRecruitingBoardView("invalid")).toBe("all");
    expect(resolveRecruitingBoardView("screening")).toBe("screening:all");
    expect(resolveRecruitingBoardView("ai_interview")).toBe("interview:ai");
    expect(resolveRecruitingBoardView("income_proof")).toBe("offer:income");
  });

  it("全部首项默认选中，依流程顺序汇总所有具体子标签", () => {
    expect(recruitingBoardGroups[0]).toEqual({
      id: "all",
      label: "全部",
      tabs: recruitingBoardAllTabs,
    });
    expect(recruitingBoardAllTabs[0]).toEqual({ label: "全部", value: "all" });
    const expected = recruitingBoardGroups.slice(1).flatMap((group) =>
      group.tabs
        .filter((tab) => !tab.value.endsWith(":all"))
        .map((tab) => ({
          label: `${group.label} · ${tab.label}`,
          value: `all:${tab.value}`,
        })),
    );
    expect(recruitingBoardAllTabs.slice(1)).toEqual(expected);
    expect(new Set(recruitingBoardAllTabs.map((tab) => tab.value)).size).toBe(18);
    expect(recruitingBoardViewSchema.safeParse("all:screening:all").success).toBe(false);
  });

  it.each(recruitingBoardAllTabs)("聚合 URL $value 保留全部父标签和准确中文", (tab) => {
    expect(recruitingBoardViewSchema.parse(tab.value)).toBe(tab.value);
    expect(resolveRecruitingBoardView(tab.value)).toBe(tab.value);
    expect(getRecruitingBoardGroup(tab.value).id).toBe("all");
    expect(getRecruitingBoardViewLabel(tab.value)).toBe(tab.label);
    expect(resolveRecruitingBoardFilterView(tab.value)).toBe(
      tab.value === "all" ? undefined : tab.value.slice(4),
    );
  });

  it("原阶段标签不会被全部聚合标签抢占", () => {
    expect(getRecruitingBoardGroup("screening:pending").id).toBe("screening");
    expect(getRecruitingBoardGroup("interview:ai").id).toBe("interview");
    expect(getRecruitingBoardViewLabel("screening:pending")).toBe("简历筛选 · 未处理");
    expect(getRecruitingBoardViewLabel("offer:all")).toBe("Offer协商");
  });

  it("固定阶段预设拒绝跨阶段筛选并保留同组子流程", () => {
    expect(resolveRecruitingBoardPresetView("interview", "offer:send")).toBe("interview:all");
    expect(resolveRecruitingBoardPresetView("interview", "interview:final")).toBe(
      "interview:final",
    );
    expect(resolveRecruitingBoardPresetView("invalid", "offer:send")).toBe("offer:send");
  });

  it("固定阶段预设生成对应的招聘台页面标题", () => {
    expect(getRecruitingBoardPageTitle()).toBe("招聘台");
    expect(getRecruitingBoardPageTitle("invalid")).toBe("招聘台");
    expect(getRecruitingBoardPageTitle("screening")).toBe("招聘台·简历筛选");
    expect(getRecruitingBoardPageTitle("interview")).toBe("招聘台·面试");
    expect(getRecruitingBoardPageTitle("offer")).toBe("招聘台·Offer协商");
    expect(getRecruitingBoardPageTitle("onboarding")).toBe("招聘台·入职办理");
    expect(getRecruitingBoardPageTitle("closed")).toBe("招聘台·已结束");
  });

  it("固定阶段预设提供阶段内状态，不包含汇总项", () => {
    expect(getRecruitingBoardPresetStatusTabs("offer")).toEqual([
      { label: "流水提供", value: "offer:income" },
      { label: "谈薪", value: "offer:negotiating" },
      { label: "发 Offer", value: "offer:send" },
      { label: "背调", value: "offer:background" },
    ]);
    expect(getRecruitingBoardPresetStatusTabs()).toEqual([]);
  });
});
