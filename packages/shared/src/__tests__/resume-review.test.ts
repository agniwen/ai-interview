import { describe, expect, it } from "vitest";
import {
  computeResumeReviewBaseScore,
  formatResumeReviewMarkdown,
  getResumeReviewBaseScore,
  getResumeReviewDimension,
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
    impactResults: {
      rationale: "核心项目有明确业务结果",
      score: 92,
    },
    roleRelevance: {
      rationale: "岗位关键词和职责方向匹配",
      score: 82,
    },
    signalCredibility: {
      rationale: "成果上下文仍需核实",
      score: 78,
    },
    structureReadability: {
      rationale: "简历层级清晰，便于扫读",
      score: 80,
    },
    technicalDepth: {
      rationale: "技术栈和工程化细节充分",
      score: 90,
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
    baseScore: 86,
    conclusion: "候选人与前端工程师岗位匹配度较高，但成果可信度需要面试核实。",
    scoreRationale: "基于五维度按 30/25/20/15/10 加权得出基础分 86（不含历史面试加权）",
  },
  schemaVersion: 3,
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
  it("weights the shared five-dimension framework by 30/25/20/15/10", () => {
    const score = computeResumeReviewBaseScore(REVIEW.dimensions);
    expect(score).toBe(Math.round(92 * 0.3 + 90 * 0.25 + 82 * 0.2 + 80 * 0.15 + 78 * 0.1));
  });
});

describe("getResumeReviewBaseScore", () => {
  it("reads v3 baseScore", () => {
    expect(getResumeReviewBaseScore(REVIEW)).toBe(86);
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
    expect(getResumeReviewDimension(REVIEW, "impactResults")?.score).toBe(92);
  });

  it("returns null for legacy v1 dimension keys", () => {
    const v1Dimensions = {
      skillMatch: { rationale: "...", score: 80 },
    };
    const v1Like = { ...REVIEW, dimensions: v1Dimensions } as unknown as typeof REVIEW;
    expect(getResumeReviewDimension(v1Like, "impactResults")).toBeNull();
  });
});

describe("formatResumeReviewMarkdown", () => {
  it("renders the structured review into the legacy editable notes format", () => {
    expect(formatResumeReviewMarkdown(REVIEW)).toMatchInlineSnapshot(`
      "**候选人结论**
      候选人与前端工程师岗位匹配度较高，但成果可信度需要面试核实。
      
      **综合评分**
      86 / 100。基于五维度按 30/25/20/15/10 加权得出基础分 86（不含历史面试加权）
      
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
