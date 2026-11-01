import { describe, expect, it } from "vitest";
import {
  shouldShowAiInterviewTab,
  shouldShowHumanInterviewTab,
  shouldShowOfferTab,
  shouldShowOnboardingTab,
  tabForPipelineStage,
} from "./studio-person-detail-model";

describe("招聘子节点所属详情 tab", () => {
  it.each(["income_proof", "offer", "background_check"] as const)(
    "%s 显示并定位到 Offer tab",
    (pipelineStage) => {
      expect(shouldShowOfferTab({ pipelineStage }, true)).toBe(true);
      expect(shouldShowOfferTab({ pipelineStage }, false)).toBe(false);
      expect(tabForPipelineStage(pipelineStage)).toBe("offer");
    },
  );
  it.each([
    ["screening", "overview"],
    ["ai_interview", "rounds"],
    ["second_interview", "human-interview"],
    ["final_interview", "human-interview"],
    ["onboarding", "onboarding"],
    ["closed", "overview"],
  ] as const)("%s 定位到 %s", (stage, tab) => {
    expect(tabForPipelineStage(stage)).toBe(tab);
  });
  it("Offer 之前不显示，结束后保留查看入口", () => {
    expect(shouldShowOfferTab({ pipelineStage: "final_interview" }, true)).toBe(false);
    expect(shouldShowOfferTab({ closedFromNode: "offer", pipelineStage: "closed" }, true)).toBe(
      true,
    );
  });

  it("存在真人面试记录时保留对应阶段入口", () => {
    expect(
      shouldShowHumanInterviewTab({ hasHumanInterview: true, pipelineStage: "ai_interview" }, true),
    ).toBe(true);
    expect(
      shouldShowHumanInterviewTab(
        { hasHumanInterview: true, pipelineStage: "ai_interview" },
        false,
      ),
    ).toBe(false);
  });
});

it("入职 tab 仅在入职阶段及其结束记录展示", () => {
  expect(shouldShowOnboardingTab({ pipelineStage: "onboarding" })).toBe(true);
  expect(shouldShowOnboardingTab({ closedFromNode: "onboarding", pipelineStage: "closed" })).toBe(
    true,
  );
  expect(shouldShowOnboardingTab({ closedFromNode: "screening", pipelineStage: "closed" })).toBe(
    false,
  );
  expect(shouldShowOnboardingTab({ pipelineStage: "background_check" })).toBe(false);
});

it.each([
  ["screening", false, false, false],
  ["ai_interview", true, false, false],
  ["second_interview", true, true, false],
  ["final_interview", true, true, false],
  ["income_proof", true, true, true],
  ["salary_negotiation", true, true, true],
  ["offer", true, true, true],
  ["background_check", true, true, true],
  ["onboarding", true, true, true],
  [null, false, false, false],
] as const)("结束于 %s 仅显示已到达阶段", (closedFromNode, ai, human, offer) => {
  const record = { closedFromNode, pipelineStage: "closed" };
  expect(shouldShowAiInterviewTab(record)).toBe(ai);
  expect(shouldShowHumanInterviewTab(record, true)).toBe(human);
  expect(shouldShowOfferTab(record, true)).toBe(offer);
  expect(shouldShowOfferTab(record, false)).toBe(false);
});

it("结束或回退后仍保留实际面试记录的查看入口", () => {
  const record = {
    closedFromNode: "screening",
    hasHumanInterview: true,
    hasInitialInterview: true,
    pipelineStage: "closed",
  };
  expect(shouldShowAiInterviewTab(record)).toBe(true);
  expect(shouldShowHumanInterviewTab(record, true)).toBe(true);
  expect(shouldShowHumanInterviewTab(record, false)).toBe(false);
  expect(shouldShowOfferTab(record, true)).toBe(false);
});
