// 中文：JD 匹配报告卡片快照
// English: JD-match report card snapshot
import { describe, expect, it } from "vitest";
import { JdMatchReportCard } from "../cards/jd-match-report-card";

describe("JdMatchReportCard", () => {
  it("includes JD title in header and labels score as match score", () => {
    const card = JdMatchReportCard({
      candidateName: "张三",
      followUps: [],
      jdTitle: "前端工程师",
      level: null,
      recommendation: "推荐",
      risks: ["跳槽频繁"],
      score: 78,
      strengths: ["React 经验丰富"],
      team: null,
    });
    const json = JSON.stringify(card);
    expect(json).toContain("前端工程师");
    expect(json).toContain("张三");
    expect(json).toContain("匹配度");
    expect(json).toContain("78");
    expect(json).toContain("React");
  });

  it("renders gracefully without optional fields", () => {
    const card = JdMatchReportCard({ jdTitle: "后端工程师" });
    const json = JSON.stringify(card);
    expect(json).toContain("后端工程师");
    expect(json).toContain("待核实");
  });
});
