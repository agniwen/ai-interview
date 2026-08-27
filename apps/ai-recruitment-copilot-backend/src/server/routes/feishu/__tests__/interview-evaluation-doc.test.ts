import { describe, expect, it } from "vitest";
import { buildInterviewEvaluationDocument } from "../utils/interview-evaluation-doc";
import type { FeishuDocumentBlock } from "../utils/interview-evaluation-doc";

const BLOCK_TYPE = {
  BULLET: 12,
  CALLOUT: 19,
  HEADING_2: 4,
  ORDERED: 13,
  TEXT: 2,
  TODO: 17,
} as const;

function blockText(block: FeishuDocumentBlock): string | undefined {
  const content =
    block.bullet ?? block.heading2 ?? block.heading3 ?? block.ordered ?? block.text ?? block.todo;
  return content?.elements[0]?.text_run.content;
}

describe("buildInterviewEvaluationDocument", () => {
  it("places the qualitative resume evaluation directly below the resume", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      evaluation: {},
      resumeEvaluation: {
        detailedOverall: {
          judgment: "候选人的核心技术经历与岗位要求高度一致。",
          matchingEvidence: "- 主导过同类系统建设\n- 具备目标技术栈经验",
          risks: "1. 团队管理跨度仍需确认\n2. 海外协作经验需要核实",
        },
      },
      resumeUrl: "https://example.com/resume",
    });

    expect(document.blocks.slice(0, 4).map((block) => block.block_type)).toEqual([4, 2, 19, 19]);
    expect(document.blocks.slice(0, 2).map(blockText)).toEqual(["简历", "查看候选人简历"]);
    expect(document.blocks.at(3)?.children?.map(blockText)).toContain("HR面试评价");
    expect(document.blocks.at(2)?.callout).toEqual({
      background_color: 5,
      border_color: 5,
      emoji_id: "books",
    });
    expect(document.blocks.at(2)?.children?.map(blockText)).toEqual([
      "简历评价",
      "候选人的核心技术经历与岗位要求高度一致。",
      "匹配依据",
      "主导过同类系统建设",
      "具备目标技术栈经验",
      "风险与待确认项",
      "团队管理跨度仍需确认",
      "海外协作经验需要核实",
    ]);
    expect(document.blocks.at(2)?.children?.map((block) => block.block_type)).toEqual([
      BLOCK_TYPE.TEXT,
      BLOCK_TYPE.TEXT,
      BLOCK_TYPE.TEXT,
      BLOCK_TYPE.BULLET,
      BLOCK_TYPE.BULLET,
      BLOCK_TYPE.TEXT,
      BLOCK_TYPE.ORDERED,
      BLOCK_TYPE.ORDERED,
    ]);
  });

  it("places recommended interview questions immediately before the first business review", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      evaluation: {},
      recommendedQuestions: [
        {
          difficulty: "medium",
          evaluationFocus: "验证候选人的系统设计能力和技术取舍。",
          followUpDirections: "继续追问容量估算、故障降级和替代方案。",
          order: 2,
          question: "请介绍你主导过的高并发系统设计。",
        },
        {
          difficulty: "easy",
          evaluationFocus: "确认候选人在项目中的实际职责。",
          followUpDirections: "追问关键交付物以及与其他成员的分工。",
          order: 1,
          question: "请介绍你在最近项目中的角色。",
        },
      ],
      resumeUrl: "https://example.com/resume",
    });

    const recommendedBlockIndex = document.blocks.findIndex((block) =>
      block.children?.some((child) => blockText(child) === "推荐面试题"),
    );
    const businessReviewIndex = document.blocks.findIndex((block) =>
      block.children?.some((child) => blockText(child) === "业务一面评价"),
    );

    expect(recommendedBlockIndex).toBeGreaterThanOrEqual(0);
    expect(recommendedBlockIndex).toBe(businessReviewIndex - 1);
    expect(document.blocks.at(recommendedBlockIndex)?.callout).toEqual({
      background_color: 6,
      border_color: 6,
      emoji_id: "technologist",
    });
    expect(document.blocks.at(recommendedBlockIndex)?.children?.map(blockText)).toEqual([
      "推荐面试题",
      "1. 请介绍你在最近项目中的角色。",
      "考核点",
      "确认候选人在项目中的实际职责。",
      "追问方向",
      "追问关键交付物以及与其他成员的分工。",
      "",
      "2. 请介绍你主导过的高并发系统设计。",
      "考核点",
      "验证候选人的系统设计能力和技术取舍。",
      "追问方向",
      "继续追问容量估算、故障降级和替代方案。",
    ]);
  });

  it("keeps manually edited questions when optional guidance is blank", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      evaluation: {},
      recommendedQuestions: [
        {
          difficulty: "medium",
          evaluationFocus: "",
          followUpDirections: "",
          order: 1,
          question: "请介绍一次关键技术决策。",
        },
      ],
      resumeUrl: "https://example.com/resume",
    });

    const recommendedBlock = document.blocks.find((block) =>
      block.children?.some((child) => blockText(child) === "推荐面试题"),
    );

    expect(recommendedBlock?.children?.map(blockText)).toEqual([
      "推荐面试题",
      "1. 请介绍一次关键技术决策。",
      "考核点",
      "未提供",
      "追问方向",
      "未提供",
    ]);
  });

  it("omits the duplicate resume heading and link when a PDF attachment is present", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      evaluation: {},
      includeResumeLink: false,
      resumeUrl: "https://example.com/resume",
    });

    expect(document.blocks[0]?.block_type).toBe(BLOCK_TYPE.CALLOUT);
    expect(JSON.stringify(document.blocks)).not.toContain("简历");
    expect(JSON.stringify(document.blocks)).not.toContain("https://example.com/resume");
  });

  it("keeps every manual evaluation section from the Feishu template", () => {
    const document = buildInterviewEvaluationDocument({
      candidateName: "张三",
      evaluation: {},
      resumeUrl: "https://example.com/resume",
    });

    expect(document.blocks.map((block) => block.block_type)).toEqual([
      BLOCK_TYPE.HEADING_2,
      BLOCK_TYPE.TEXT,
      BLOCK_TYPE.CALLOUT,
      BLOCK_TYPE.HEADING_2,
      BLOCK_TYPE.TODO,
      BLOCK_TYPE.TODO,
      BLOCK_TYPE.TODO,
      BLOCK_TYPE.TODO,
      BLOCK_TYPE.CALLOUT,
      BLOCK_TYPE.CALLOUT,
      BLOCK_TYPE.CALLOUT,
      BLOCK_TYPE.CALLOUT,
    ]);

    expect(document.blocks.slice(3, 8).map(blockText)).toEqual([
      "评级等级确定",
      "A-超出预期 薪资110%~130%",
      "B-完全匹配 薪资100%~120%",
      "C-基本匹配 薪资90%~110%",
      "D-勉强接受 薪资80%~100%",
    ]);

    const commonStageFields = [
      "评级（A,B,C,D）：",
      "职级定位：业务负责人/小组主管/执行员工",
      "角色定位：主导决策者/辅助执行者",
      "专业技能：优/良/中/差",
      "优势特点：",
      "劣势风险：",
      "薪资建议：月薪",
    ];
    const [businessOne, businessTwo, hrd, ceo] = document.blocks.slice(8);
    expect(businessOne?.children?.map(blockText)).toEqual(["业务一面评价", ...commonStageFields]);
    expect(businessTwo?.children?.map(blockText)).toEqual(["业务二面评价", ...commonStageFields]);
    expect(hrd?.children?.map(blockText)).toEqual(["HRD面试评价", ...commonStageFields]);
    expect(ceo?.children?.map(blockText)).toEqual(["CEO面试评价"]);
    expect([businessOne, businessTwo, hrd, ceo].map((block) => block?.callout?.emoji_id)).toEqual([
      "technologist",
      "man_technologist",
      "office_worker",
      "man_office_worker",
    ]);

    const hrSection = document.blocks.at(2);
    expect(hrSection?.children?.map(blockText)).toContain("HR面试评价");
    expect(hrSection?.callout?.emoji_id).toBe("books");
    expect(hrSection?.children?.[0]?.text?.elements[0]?.text_run.text_element_style?.bold).toBe(
      true,
    );
  });

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
    expect(document.blocks.slice(0, 3).map((block) => block.block_type)).toEqual([4, 2, 19]);

    const hrCallout = document.blocks.at(2);
    expect(hrCallout).toBeDefined();
    if (!hrCallout) {
      throw new Error("Expected HR callout block");
    }
    expect(hrCallout.callout).toEqual({
      background_color: 2,
      border_color: 2,
      emoji_id: "books",
    });
    expect(hrCallout.children?.filter((block) => block.block_type === 13)).toHaveLength(0);
    expect(
      hrCallout.children?.filter((block) => JSON.stringify(block).includes("答案：")),
    ).toHaveLength(0);
    expect(JSON.stringify(hrCallout.children)).toContain("HR面试评价");
    expect(JSON.stringify(hrCallout.children)).not.toContain("📚 HR面试评价");
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
