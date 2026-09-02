import { toCardElement } from "chat";
import { describe, expect, it } from "vitest";
import { toLarkInteractiveCard } from "../bot";
import { InterviewSummaryCard } from "../interview-summary-card";

describe("toLarkInteractiveCard", () => {
  it("renders the interview summary as a native Feishu interactive card", () => {
    const chatCard = toCardElement(
      InterviewSummaryCard({
        assessment: "整体匹配度较高。",
        candidateName: "张三",
        detailUrl: "https://example.com/studio/interviews?roundId=round-1",
        duration: "18 分钟",
        interviewQuestions: [
          "请说明你如何定位一次线上性能问题？（业务水平）",
          "请介绍你主导的跨团队项目。（项目管理）",
          "你会如何评估 AI 功能的业务价值？（AI应用）",
          "这道题不应出现在通知中。（软实力）",
        ],
        interviewStartedAt: "2026/07/07 14:20",
        overallScore: "86/100",
        questionAnswers: [
          { answer: "我先根据监控缩小范围，再结合火焰图定位热点。", question: "系统设计追问" },
          { answer: "我会从渲染次数和资源加载两个方向排查。", question: "React 性能优化" },
        ],
        recommendation: "推荐进入下一轮",
        resumeEvaluation: "候选人的企业软件经验与岗位核心要求相符，建议进入下一轮。",
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
        { data_type: "text", display_name: "候选人回答", name: "col_1" },
      ],
      rows: [
        {
          col_0: "系统设计追问",
          col_1: "我先根据监控缩小范围，再结合火焰图定位热点。",
        },
        { col_0: "React 性能优化", col_1: "我会从渲染次数和资源加载两个方向排查。" },
      ],
      tag: "table",
    });
    expect(JSON.stringify(larkCard)).not.toContain("| 题目 | 得分 |");
    expect(JSON.stringify(larkCard)).not.toContain("题目得分概览");
    expect(JSON.stringify(larkCard)).toContain("**题目回答概览**");
    expect(JSON.stringify(larkCard)).toContain("系统设计追问");
    expect(JSON.stringify(larkCard)).toContain("**简历 AI 评价**");
    expect(JSON.stringify(larkCard)).toContain(
      "候选人的企业软件经验与岗位核心要求相符，建议进入下一轮。",
    );
    expect(JSON.stringify(larkCard)).toContain("**候选人面试题（节选 3 道）**");
    expect(JSON.stringify(larkCard)).toContain("1. 请说明你如何定位一次线上性能问题？（业务水平）");
    expect(JSON.stringify(larkCard)).toContain("3. 你会如何评估 AI 功能的业务价值？（AI应用）");
    expect(JSON.stringify(larkCard)).not.toContain("这道题不应出现在通知中");
    expect(JSON.stringify(larkCard)).toContain("整体匹配度较高。");
    expect(JSON.stringify(larkCard)).toContain('"tag":"button"');
    expect(JSON.stringify(larkCard)).toContain("查看飞书评价表");
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
        interviewQuestions: [],
        interviewStartedAt: "2026/07/07 14:20",
        overallScore: "86/100",
        questionAnswers: [],
        recommendation,
        resumeEvaluation: null,
        summary: null,
        targetRole: "前端工程师",
      }),
    );

    expect(chatCard).not.toBeNull();
    if (!chatCard) {
      throw new Error("Expected InterviewSummaryCard to resolve to a Chat SDK card");
    }

    expect(toLarkInteractiveCard(chatCard).header?.template).toBe(template);
    expect(JSON.stringify(toLarkInteractiveCard(chatCard))).not.toContain("简历 AI 评价");
    expect(JSON.stringify(toLarkInteractiveCard(chatCard))).not.toContain("候选人面试题");
  });
});
