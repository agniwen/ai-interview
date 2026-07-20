import { describe, expect, it } from "vitest";
import { buildInterviewEvaluationDocument } from "../utils/interview-evaluation-doc";

describe("buildInterviewEvaluationDocument", () => {
  it("maps the AI report into the supplied interview evaluation template", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      detailUrl: "https://example.com/studio/interviews?roundId=round-1",
      duration: "18 分钟",
      evaluation: {
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
      interviewStartedAt: "2026/07/20 14:20",
      resumeUrl: "https://example.com/api/w/acme/studio/interviews/round-1/resume",
      summary: "候选人重点介绍了系统设计与团队协作经验。",
      targetRole: "后端工程师",
    });

    expect(document.title).toBe("张三 - 面试评价表");
    expect(document.blocks.map((block) => block.block_type)).toEqual([
      4, 2, 19, 4, 17, 17, 17, 17, 19, 19, 19, 19,
    ]);

    const hrCallout = document.blocks.at(2);
    expect(hrCallout).toBeDefined();
    if (!hrCallout) {
      throw new Error("Expected HR callout block");
    }
    expect(hrCallout.callout).toEqual({ background_color: 2, border_color: 2 });
    expect(JSON.stringify(hrCallout.children)).toContain("📚 HR面试评价（AI）");
    expect(JSON.stringify(hrCallout.children)).toContain("求职动机：");
    expect(JSON.stringify(hrCallout.children)).toContain("最快到岗时间");
    expect(JSON.stringify(hrCallout.children)).toContain("海外出差情况");
    expect(JSON.stringify(hrCallout.children)).toContain("薪酬预期沟通");
    expect(JSON.stringify(hrCallout.children)).toContain("加薪晋升情况");
    expect(JSON.stringify(hrCallout.children)).toContain("目前两份工作");
    expect(JSON.stringify(hrCallout.children)).toContain("签证评估情况");
    expect(JSON.stringify(hrCallout.children)).toContain("综合评分：86/100");
    expect(JSON.stringify(hrCallout.children)).toContain("建议进入下一轮");
    expect(JSON.stringify(hrCallout.children)).toContain("请介绍缓存设计（9/10）");
    expect(JSON.stringify(hrCallout.children)).toContain("我们使用两级缓存，并设置主动失效。");

    expect(document.blocks.at(8)?.callout).toEqual({ background_color: 4, border_color: 4 });
    expect(JSON.stringify(document.blocks.at(8)?.children)).toContain("🧑‍💻 业务一面评价");
    expect(document.blocks.at(10)?.callout).toEqual({ background_color: 3, border_color: 2 });
    expect(JSON.stringify(document.blocks.at(10)?.children)).toContain("🧑‍💼 HRD面试评价");
    expect(document.blocks.at(11)?.callout).toEqual({ background_color: 1, border_color: 1 });
    expect(JSON.stringify(document.blocks.at(11)?.children)).toContain("👨‍💼 CEO面试评价");
    expect(JSON.stringify(document.blocks.at(1))).toContain(
      "https://example.com/api/w/acme/studio/interviews/round-1/resume",
    );
    expect(JSON.stringify(hrCallout.children)).toContain(
      "https://example.com/studio/interviews?roundId=round-1",
    );
  });

  it("keeps partial reports useful without inventing missing values", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "李四",
      detailUrl: "https://example.com/report",
      duration: "未知",
      evaluation: {},
      interviewStartedAt: "未知",
      resumeUrl: "https://example.com/resume",
      summary: null,
      targetRole: null,
    });

    const serialized = JSON.stringify(document);
    expect(serialized).toContain("综合评分：暂无评分");
    expect(serialized).toContain("推荐结论：暂无建议");
    expect(serialized).toContain("面试摘要：暂无摘要");
    expect(serialized).not.toContain("undefined");
  });
});
