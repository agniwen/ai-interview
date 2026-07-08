import { describe, expect, it } from "vitest";
import { extractAnswerKeywords } from "./answer-keywords";
import type { KeywordSpan } from "./answer-keywords";

function texts(spans: KeywordSpan[]): string[] {
  return spans.map((span) => span.text);
}

describe("extractAnswerKeywords", () => {
  it("returns empty for empty input", () => {
    expect(extractAnswerKeywords("")).toEqual([]);
  });

  it("matches skill terms including symbol-bearing and Chinese", () => {
    const spans = extractAnswerKeywords("我用 React 和 Node.js 做过项目管理");
    expect(texts(spans)).toEqual(expect.arrayContaining(["React", "Node.js", "项目管理"]));
  });

  it("does not match a latin skill inside a larger word", () => {
    const spans = extractAnswerKeywords("javascript 很熟");
    expect(spans.filter((span) => span.text.toLowerCase() === "java")).toHaveLength(0);
  });

  it("matches numbers with units but not bare numbers", () => {
    const spans = extractAnswerKeywords("绩效提升30%，带10人团队，3.5年经验");
    expect(texts(spans)).toEqual(expect.arrayContaining(["30%", "10人", "3.5年"]));
    const bare = extractAnswerKeywords("我是2024届，做对了第3题");
    expect(texts(bare)).not.toEqual(expect.arrayContaining(["2024", "3"]));
  });

  it("matches risk words", () => {
    const spans = extractAnswerKeywords("这个我不太清楚，应该是别人做的");
    const risks = spans.filter((span) => span.category === "risk").map((span) => span.text);
    expect(risks).toEqual(expect.arrayContaining(["不太清楚", "应该是"]));
  });

  it("prefers risk over skill on identical overlap", () => {
    const spans = extractAnswerKeywords("这题我不太清楚", { extraSkills: ["不太清楚"] });
    expect(spans.find((span) => span.text === "不太清楚")?.category).toBe("risk");
  });

  it("returns non-overlapping spans in ascending order", () => {
    const spans = extractAnswerKeywords("没做过数据分析，绩效提升30%");
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
  });

  it("merges and dedupes extraSkills case-insensitively", () => {
    const spans = extractAnswerKeywords("我精通 ReScript 框架", {
      extraSkills: ["ReScript", "rescript"],
    });
    expect(spans.filter((span) => span.text.toLowerCase() === "rescript")).toHaveLength(1);
  });

  it("produces identical spans for the same text", () => {
    const sample = "绩效提升30%，负责项目管理";
    expect(extractAnswerKeywords(sample)).toEqual(extractAnswerKeywords(sample));
  });
});
