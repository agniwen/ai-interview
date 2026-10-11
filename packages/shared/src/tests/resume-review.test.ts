import { describe, expect, it } from "vitest";
import {
  computeResumeReviewBaseScore,
  describeResumeLibraryReviewCard,
  formatResumeReviewMarkdown,
  getResumeReviewActionTone,
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  getResumeReviewScoreSentiment,
  resumeReviewSchema,
} from "../resume-review";
import type { ResumeReview } from "../resume-review";

const REVIEW: ResumeReview = {
  biasScan: {
    items: [
      {
        category: "credibility_risk",
        description: "核心项目结果缺少可验证上下文",
        impact: "需要在面试中追问指标口径和个人贡献边界",
      },
    ],
  },
  dimensions: {
    educationBackground: {
      rationale: "本科计算机相关背景符合岗位预期",
      score: 80,
    },
    experienceRelevance: {
      rationale: "前端业务领域和技术栈吻合",
      score: 90,
    },
    potential: {
      rationale: "经历体现持续学习和工程广度",
      score: 88,
    },
    projectMatch: {
      rationale: "核心项目复杂度和岗位要求对应",
      score: 82,
    },
    skillMatch: {
      rationale: "核心技能与 JD 高度匹配",
      score: 92,
    },
    stability: {
      rationale: "职业经历较连贯，但部分成果上下文仍需核实",
      score: 78,
    },
  },
  levelRecommendation: {
    level: "中高级",
    rationale: "能独立负责复杂前端模块，但系统设计证据不足",
  },
  nextStep: {
    action: "interview",
    disclaimer: "以上为初步结论",
    interviewFocus: ["追问性能优化指标", "核实项目中的个人贡献"],
    rationale: "岗位匹配度较高，建议通过面试核实关键风险",
  },
  overall: {
    baseScore: 88,
    conclusion: "候选人与前端工程师岗位匹配度较高，但成果可信度需要面试核实。",
    scoreRationale: "基于六维度按 35/25/15/10/8/7 加权得出基础分 88（不含历史面试加权）",
  },
  schemaVersion: 4,
  strengths: [
    {
      evidence: "简历提到主导 B 端系统前端重构",
      impact: "能覆盖当前岗位的复杂业务前端需求",
      point: "具备复杂前端项目经验",
    },
  ],
  teamPositioning: {
    rationale: "候选人经历集中在工程化、性能和业务交付",
    suggestion: "适合进入业务平台或中后台效率工具团队",
  },
  weaknesses: [
    {
      evidence: null,
      impact: "需要面试确认技术方案深度",
      point: "架构权衡表达不足",
    },
  ],
};

describe("resume review schema", () => {
  it("accepts the structured resume review shape used by cards and persistence", () => {
    expect(resumeReviewSchema.parse(REVIEW)).toEqual(REVIEW);
  });

  it("rejects out-of-range scores", () => {
    expect(
      resumeReviewSchema.safeParse({
        ...REVIEW,
        overall: { ...REVIEW.overall, baseScore: 101 },
      }).success,
    ).toBe(false);
  });
});

describe("computeResumeReviewBaseScore", () => {
  it("weights the product six-dimension framework by 35/25/15/10/8/7", () => {
    const score = computeResumeReviewBaseScore(REVIEW.dimensions);
    expect(score).toBe(
      Math.round(92 * 0.35 + 90 * 0.25 + 82 * 0.15 + 80 * 0.1 + 88 * 0.08 + 78 * 0.07),
    );
  });
});

describe("getResumeReviewBaseScore", () => {
  it("reads v4 baseScore", () => {
    expect(getResumeReviewBaseScore(REVIEW)).toBe(88);
  });

  it("falls back to v1 overall.score when baseScore is absent", () => {
    const v1Like = {
      ...REVIEW,
      overall: { conclusion: REVIEW.overall.conclusion, score: 82, scoreRationale: "..." },
      schemaVersion: 1 as const,
    } as const;
    expect(getResumeReviewBaseScore(v1Like)).toBe(82);
  });

  it("returns null when neither baseScore nor score exists", () => {
    const v1Like = {
      ...REVIEW,
      overall: { conclusion: REVIEW.overall.conclusion, scoreRationale: "..." },
      schemaVersion: 1 as const,
    } as const;
    expect(getResumeReviewBaseScore(v1Like)).toBeNull();
  });
});

describe("getResumeReviewDimension", () => {
  it("returns the dimension when present", () => {
    expect(getResumeReviewDimension(REVIEW, "skillMatch")?.score).toBe(92);
  });

  it("returns null for legacy v1 dimension keys", () => {
    const v1Dimensions = {
      roleFit: { rationale: "...", score: 80 },
    };
    // SAFETY: This fixture deliberately models a legacy persisted v1 payload against the current reader.
    const v1Like = { ...REVIEW, dimensions: v1Dimensions } as typeof REVIEW;
    expect(getResumeReviewDimension(v1Like, "skillMatch")).toBeNull();
  });
});

describe("formatResumeReviewMarkdown", () => {
  it("renders the structured review into the legacy editable notes format", () => {
    expect(formatResumeReviewMarkdown(REVIEW)).toMatchInlineSnapshot(`
      "**候选人结论**
      候选人与前端工程师岗位匹配度较高，但成果可信度需要面试核实。
      
      **综合评分**
      88 / 100。基于六维度按 35/25/15/10/8/7 加权得出基础分 88（不含历史面试加权）
      
      **优点**
      - 具备复杂前端项目经验：简历提到主导 B 端系统前端重构。影响：能覆盖当前岗位的复杂业务前端需求。
      
      **缺点**
      - 架构权衡表达不足：待核实。影响：需要面试确认技术方案深度。
      
      **偏差扫描**
      发现 1 个关键偏差：硬缺口 0 项 / 软错位 0 项 / 真实性存疑 1 项 / 稳定性信号 0 项。
      - 核心项目结果缺少可验证上下文 → 真实性存疑 → 需要在面试中追问指标口径和个人贡献边界
      
      **团队定位建议**
      适合进入业务平台或中后台效率工具团队。依据：候选人经历集中在工程化、性能和业务交付。
      
      **职级建议**
      中高级。依据：能独立负责复杂前端模块，但系统设计证据不足。
      
      **下一步建议**
      进入面试。岗位匹配度较高，建议通过面试核实关键风险。面试重点：追问性能优化指标；核实项目中的个人贡献。以上为初步结论。"
    `);
  });
});

describe("resume library card review helpers", () => {
  it("maps score bands to thumb sentiments", () => {
    expect(getResumeReviewScoreSentiment(70)).toBe("positive");
    expect(getResumeReviewScoreSentiment(50)).toBe("neutral");
    expect(getResumeReviewScoreSentiment(49)).toBe("negative");
  });

  it("maps next-step actions to text tones", () => {
    expect(getResumeReviewActionTone("interview")).toBe("success");
    expect(getResumeReviewActionTone("hold")).toBe("warning");
    expect(getResumeReviewActionTone("reject")).toBe("danger");
    expect(getResumeReviewActionTone(null)).toBe("muted");
  });

  it("describes ready / pending / failed card copy", () => {
    expect(
      describeResumeLibraryReviewCard({
        baseScore: 72,
        nextStepAction: "interview",
        status: "ready",
      }),
    ).toEqual({
      label: "建议进入面试（72分）",
      scoreSentiment: "positive",
      tone: "success",
    });

    expect(
      describeResumeLibraryReviewCard({
        baseScore: null,
        nextStepAction: null,
        status: "processing",
      }),
    ).toEqual({
      label: "生成中…",
      scoreSentiment: null,
      tone: "muted",
    });

    expect(
      describeResumeLibraryReviewCard({
        baseScore: null,
        nextStepAction: null,
        status: "failed",
      }),
    ).toEqual({
      label: "生成失败",
      scoreSentiment: null,
      tone: "muted",
    });

    expect(
      describeResumeLibraryReviewCard({
        baseScore: null,
        nextStepAction: null,
        status: "idle",
      }),
    ).toEqual({
      label: "未生成",
      scoreSentiment: null,
      tone: "muted",
    });
  });
});
