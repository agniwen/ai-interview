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

  it("matches Chinese-numeral magnitudes (千万/二十多万)", () => {
    const spans = extractAnswerKeywords("GMV就过了千万，有二十多万的付费会员");
    expect(texts(spans)).toEqual(expect.arrayContaining(["千万", "二十多万"]));
    // 中文数字后接非量级单位不算 metric，避免「一个」「那一年度」误标
    const noise = extractAnswerKeywords("那一年度做了一个付费会员");
    expect(noise.filter((span) => span.category === "metric")).toHaveLength(0);
  });

  it("matches letter grades (S级/A级) but not 公司级", () => {
    const spans = extractAnswerKeywords("那一年度公司级的唯一S级项目奖，我评的是A级");
    const metrics = spans.filter((span) => span.category === "metric").map((span) => span.text);
    expect(metrics).toEqual(expect.arrayContaining(["S级", "A级"]));
    // `级` 前是汉字（公司级）不算字母等级
    expect(metrics).not.toContain("公司级");
    expect(metrics).not.toContain("司级");
  });

  it("matches signed numbers and K/M magnitudes", () => {
    const spans = extractAnswerKeywords("年薪30K，服务1.2M用户，利润-500万，同比-30%");
    expect(texts(spans)).toEqual(expect.arrayContaining(["30K", "1.2M", "-500万", "-30%"]));
    // 连字符不是负号；K/M 后接字母不算量级
    const noise = extractAnswerKeywords("需要3-5年经验，跑了3km");
    const metrics = noise.filter((span) => span.category === "metric").map((span) => span.text);
    expect(metrics).toContain("5年");
    expect(metrics).not.toContain("-5年");
    expect(metrics.some((value) => value.toLowerCase() === "3k")).toBe(false);
  });

  it("matches risk words", () => {
    const spans = extractAnswerKeywords("这个我不太清楚，应该是别人做的");
    const risks = spans.filter((span) => span.category === "risk").map((span) => span.text);
    expect(risks).toEqual(expect.arrayContaining(["不太清楚", "应该是"]));
  });

  it("skips risk words negated by a preceding negation", () => {
    const negated = extractAnswerKeywords("我从没想过离职");
    const negatedRisks = negated
      .filter((span) => span.category === "risk")
      .map((span) => span.text);
    expect(negatedRisks).not.toContain("离职");
    const kept = extractAnswerKeywords("我打算年底离职");
    const keptRisks = kept.filter((span) => span.category === "risk").map((span) => span.text);
    expect(keptRisks).toContain("离职");
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
