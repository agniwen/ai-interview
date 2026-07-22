import { describe, expect, it } from "vitest";
import { buildInterviewEvaluationDocument } from "../utils/interview-evaluation-doc";

describe("buildInterviewEvaluationDocument", () => {
  it("shows only the seven HR questions and answers in the HR section", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      evaluation: {
        hrEvaluation: {
          availability: "目前在职，预计一个月内到岗。",
          careerProgression: "最近两份工作分别获得一次晋升，绩效均为 A。",
          compensationExpectations: "当前固定月薪 30k，期望年包 50 万。",
          jobMotivation: "希望承担更完整的系统架构职责。",
          overseasTravel: "已婚，可以接受每次两周以内的海外出差。",
          projectHighlights: "主导招聘系统从零到一建设。",
          recentWork: "最近两家公司约 200 人，主要担任项目主导者。",
        },
        overallAssessment: "项目经验完整，沟通清晰。",
        overallScore: 86,
        questions: [
          {
            assessment: "能够解释缓存与失效策略。",
            evidence: [{ quote: "我们使用两级缓存，并设置主动失效。" }],
            maxScore: 10,
            question: "请介绍缓存设计",
            score: 9,
          },
        ],
        recommendation: "建议进入下一轮",
      },
      resumeUrl: "https://example.com/api/w/acme/studio/interviews/round-1/resume",
    });

    expect(document.title).toBe("张三 - 面试评价表");
    expect(document.blocks.map((block) => block.block_type)).toEqual([4, 2, 19]);

    const hrCallout = document.blocks.at(2);
    expect(hrCallout).toBeDefined();
    if (!hrCallout) {
      throw new Error("Expected HR callout block");
    }
    expect(hrCallout.callout).toEqual({ background_color: 2, border_color: 2 });
    expect(hrCallout.children?.filter((block) => block.block_type === 13)).toHaveLength(0);
    expect(
      hrCallout.children?.filter((block) => JSON.stringify(block).includes("答案：")),
    ).toHaveLength(0);
    expect(JSON.stringify(hrCallout.children)).toContain("📚 HR面试评价");
    expect(JSON.stringify(hrCallout.children)).toContain("求职动机：");
    expect(JSON.stringify(hrCallout.children)).toContain("最快到岗时间");
    expect(JSON.stringify(hrCallout.children)).toContain("伦敦出差情况");
    expect(JSON.stringify(hrCallout.children)).toContain("薪酬预期沟通");
    expect(JSON.stringify(hrCallout.children)).toContain("加薪晋升情况");
    expect(JSON.stringify(hrCallout.children)).toContain("目前两份工作");
    expect(JSON.stringify(hrCallout.children)).toContain("亮点项目分享");
    expect(JSON.stringify(hrCallout.children)).toContain("1. 求职动机：");
    expect(JSON.stringify(hrCallout.children)).toContain("2. 最快到岗时间");
    expect(JSON.stringify(hrCallout.children)).toContain("3. 伦敦出差情况");
    expect(JSON.stringify(hrCallout.children)).toContain("4. 薪酬预期沟通");
    expect(JSON.stringify(hrCallout.children)).toContain("5. 加薪晋升情况");
    expect(JSON.stringify(hrCallout.children)).toContain("6. 目前两份工作");
    expect(JSON.stringify(hrCallout.children)).toContain("7. 亮点项目分享");
    expect(JSON.stringify(hrCallout.children)).toContain("希望承担更完整的系统架构职责。");
    expect(JSON.stringify(hrCallout.children)).toContain("目前在职，预计一个月内到岗。");
    expect(JSON.stringify(hrCallout.children)).toContain("已婚，可以接受每次两周以内的海外出差。");
    expect(JSON.stringify(hrCallout.children)).toContain("当前固定月薪 30k，期望年包 50 万。");
    expect(JSON.stringify(hrCallout.children)).toContain(
      "最近两份工作分别获得一次晋升，绩效均为 A。",
    );
    expect(JSON.stringify(hrCallout.children)).toContain(
      "最近两家公司约 200 人，主要担任项目主导者。",
    );
    expect(JSON.stringify(hrCallout.children)).toContain("主导招聘系统从零到一建设。");
    const serializedHrCallout = JSON.stringify(hrCallout.children);
    for (const aiOnlyNote of [
      "离职原因 + 看机会核心关注点",
      "当前 base 地、求职状态及到岗时间",
      "年龄、成家情况、是否可以接受短期海外出差及周期",
      "年包=固定月薪+浮动月薪+奖金+期权/股票",
      "是否有高绩效、加薪或晋升",
      "团队架构及人员分工、离职原因",
    ]) {
      expect(serializedHrCallout).not.toContain(aiOnlyNote);
    }
    expect(
      hrCallout.children?.filter(
        (block) => block.block_type === 2 && block.text?.elements[0]?.text_run.content === "",
      ),
    ).toHaveLength(7);
    expect(serializedHrCallout).not.toContain("AI 面试结果");
    expect(serializedHrCallout).not.toContain("综合评分：86/100");
    expect(serializedHrCallout).not.toContain("建议进入下一轮");
    expect(serializedHrCallout).not.toContain("请介绍缓存设计");
    expect(serializedHrCallout).not.toContain("我们使用两级缓存，并设置主动失效。");
    expect(serializedHrCallout).not.toContain("AI面试链接");

    expect(JSON.stringify(document.blocks.at(1))).toContain(
      "https://example.com/api/w/acme/studio/interviews/round-1/resume",
    );
  });

  it("keeps partial reports useful without inventing missing values", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "李四",
      evaluation: {},
      resumeUrl: "https://example.com/resume",
    });

    const serialized = JSON.stringify(document);
    const hrChildren = document.blocks.at(2)?.children ?? [];
    const careerQuestionIndex = hrChildren.findIndex((block) =>
      JSON.stringify(block).includes("5. 加薪晋升情况："),
    );
    expect(serialized).toContain("未收集到");
    expect(serialized).not.toContain("综合评分：");
    expect(serialized).not.toContain("推荐结论：");
    expect(serialized).not.toContain("面试摘要：");
    expect(serialized).not.toContain("答案：");
    expect(serialized).not.toContain("undefined");
    expect(careerQuestionIndex).toBeGreaterThanOrEqual(0);
    expect(hrChildren.at(careerQuestionIndex + 1)?.text?.elements[0]?.text_run.content).toBe("");
  });
});
