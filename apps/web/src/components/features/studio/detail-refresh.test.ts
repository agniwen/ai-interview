import { describe, expect, it } from "vitest";
import { matchesDetailRefresh } from "./detail-refresh";
import type { StudioPersonDetailTab } from "./studio-person-detail-model";
const matches = (tab: StudioPersonDetailTab, key: unknown[]) =>
  matchesDetailRefresh(key, { recordId: "candidate", roundIds: ["round"], slug: "workspace", tab });
describe("当前 tab 刷新范围", () => {
  it("刷新当前资料，不触碰其他候选人、工作区或列表", () => {
    expect(
      matches("overview", ["studio-resumes", "workspace", "detail", "candidate", "authed"]),
    ).toBe(true);
    expect(matches("overview", ["studio-resumes", "workspace", "detail", "other"])).toBe(false);
    expect(matches("overview", ["studio-resumes", "other", "detail", "candidate"])).toBe(false);
    expect(matches("overview", ["studio-resumes", "workspace", "list"])).toBe(false);
  });
  it("仅概览刷新活动与关联会议", () => {
    for (const key of [
      ["studio-resumes", "workspace", "timeline", "candidate"],
      ["studio-resumes", "workspace", "detail", "candidate", "meetings"],
    ]) {
      expect(matches("overview", key)).toBe(true);
      expect(matches("offer", key)).toBe(false);
    }
  });
  it("AI tab 刷新轮次和报告且隔离其他轮次", () => {
    expect(matches("rounds", ["studio-resume-rounds", "workspace", "candidate"])).toBe(true);
    expect(
      matches("rounds", [
        "studio-interview-round-reports",
        "workspace",
        "round",
        "authed",
        "detail",
      ]),
    ).toBe(true);
    expect(matches("rounds", ["studio-interview-round-reports", "workspace", "other"])).toBe(false);
  });
  it.each([
    ["human-interview", "human-interview-rounds"],
    ["human-interview", "human-interview-meetings"],
    ["offer", "offer-drafts"],
  ] as const)("%s 刷新 %s", (tab, prefix) => {
    expect(matches(tab, [prefix, "workspace", "candidate"])).toBe(true);
    expect(matches("ai-analysis", [prefix, "workspace", "candidate"])).toBe(false);
  });
});
