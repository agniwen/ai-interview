import { describe, expect, it } from "vitest";
import { shouldShowOfferTab, tabForPipelineStage } from "./studio-person-detail-model";

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
    ["onboarding", "overview"],
    ["closed", "overview"],
  ] as const)("%s 定位到 %s", (stage, tab) => {
    expect(tabForPipelineStage(stage)).toBe(tab);
  });
  it("Offer 之前不显示，结束后保留查看入口", () => {
    expect(shouldShowOfferTab({ pipelineStage: "final_interview" }, true)).toBe(false);
    expect(shouldShowOfferTab({ pipelineStage: "closed" }, true)).toBe(true);
  });
});
