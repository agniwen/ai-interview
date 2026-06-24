import { describe, expect, it } from "vitest";
import { formatResumeReviewMarkdown, resumeReviewSchema } from "../resume-review";
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
    impactAndResults: {
      rationale: "有增长结果，但量化上下文不足",
      score: 76,
    },
    roleRelevance: {
      rationale: "经历与前端岗位高度相关",
      score: 88,
    },
    signalCredibility: {
      rationale: "成果表述需要进一步核实",
      score: 70,
    },
    structureReadability: {
      rationale: "时间线清晰，项目重点明确",
      score: 82,
    },
    technicalDepth: {
      rationale: "覆盖工程化和性能优化，但架构权衡描述偏少",
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
    conclusion: "候选人与前端工程师岗位匹配度较高，但成果可信度需要面试核实。",
    score: 82,
    scoreRationale: "岗位相关性和项目经验较强，可信度维度拉低总分。",
  },
  schemaVersion: 1,
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
        overall: { ...REVIEW.overall, score: 101 },
      }).success,
    ).toBe(false);
  });
});

describe("formatResumeReviewMarkdown", () => {
  it("renders the structured review into the legacy editable notes format", () => {
    expect(formatResumeReviewMarkdown(REVIEW)).toMatchInlineSnapshot(`
      "**候选人结论**
      候选人与前端工程师岗位匹配度较高，但成果可信度需要面试核实。
      
      **综合评分**
      82 / 100。岗位相关性和项目经验较强，可信度维度拉低总分。
      
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
