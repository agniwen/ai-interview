import { toCardElement } from "chat";
import { describe, expect, it } from "vitest";
import { toLarkInteractiveCard } from "../utils/bot";
import { InterviewSummaryCard } from "../utils/interview-summary-card";

describe("toLarkInteractiveCard", () => {
  it("renders the interview summary as a native Feishu interactive card", () => {
    const chatCard = toCardElement(
      InterviewSummaryCard({
        assessment: "整体匹配度较高。",
        candidateName: "张三",
        detailUrl: "https://example.com/studio/interviews?roundId=round-1",
        duration: "18 分钟",
        interviewStartedAt: "2026/07/07 14:20",
        overallScore: "86/100",
        questionScores: [
          { maxScore: 10, question: "系统设计追问", score: 5 },
          { maxScore: 10, question: "React 性能优化", score: 9 },
        ],
        recommendation: "推荐进入下一轮",
        summary: "候选人对项目经历说明完整。",
        targetRole: "前端工程师",
      }),
    );

    expect(chatCard).not.toBeNull();
    if (!chatCard) {
      throw new Error("Expected InterviewSummaryCard to resolve to a Chat SDK card");
    }
    const larkCard = toLarkInteractiveCard(chatCard);

    expect(larkCard.header?.title.content).toBe("📋 AI 面试报告已生成");
    expect(larkCard.header?.template).toBe("green");
    expect(larkCard.config.wide_screen_mode).toBe(true);
    const fieldsElement = larkCard.elements.find((element) => element.tag === "div");
    expect(fieldsElement).toMatchObject({
      fields: expect.arrayContaining([
        { is_short: true, text: { content: "**候选人**\n张三", tag: "lark_md" } },
        { is_short: true, text: { content: "**目标岗位**\n前端工程师", tag: "lark_md" } },
      ]),
      tag: "div",
    });
    expect(JSON.stringify(fieldsElement)).toContain("**综合评分**\\n86/100");
    expect(JSON.stringify(fieldsElement)).toContain("**开始时间**\\n2026/07/07 14:20");
    const tableElement = larkCard.elements.find((element) => element.tag === "table");
    expect(tableElement).toMatchObject({
      columns: [
        { data_type: "text", display_name: "题目", name: "col_0" },
        { data_type: "text", display_name: "得分", name: "col_1" },
      ],
      rows: [
        { col_0: "系统设计追问", col_1: "5/10" },
        { col_0: "React 性能优化", col_1: "9/10" },
      ],
      tag: "table",
    });
    expect(JSON.stringify(larkCard)).not.toContain("| 题目 | 得分 |");
    expect(JSON.stringify(larkCard)).toContain("系统设计追问");
    expect(JSON.stringify(larkCard)).toContain("整体匹配度较高。");
    expect(JSON.stringify(larkCard)).toContain('"tag":"button"');
    expect(JSON.stringify(larkCard)).toContain(
      '"url":"https://example.com/studio/interviews?roundId=round-1"',
    );
  });

  it.each([
    ["推荐继续面试", "green"],
    ["建议进入下一轮", "green"],
    ["待定", "orange"],
    ["不推荐继续", "red"],
    ["不建议进入下一轮", "red"],
    ["人工复核", "blue"],
  ] as const)("uses %s recommendation to render %s header", (recommendation, template) => {
    const chatCard = toCardElement(
      InterviewSummaryCard({
        assessment: null,
        candidateName: "张三",
        detailUrl: "https://example.com/studio/interviews?roundId=round-1",
        duration: "18 分钟",
        interviewStartedAt: "2026/07/07 14:20",
        overallScore: "86/100",
        questionScores: [],
        recommendation,
        summary: null,
        targetRole: "前端工程师",
      }),
    );

    expect(chatCard).not.toBeNull();
    if (!chatCard) {
      throw new Error("Expected InterviewSummaryCard to resolve to a Chat SDK card");
    }

    expect(toLarkInteractiveCard(chatCard).header?.template).toBe(template);
  });
});
