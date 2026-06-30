import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview } from "@arc/shared/resume-review";
import { formatResumeReviewMarkdown } from "@arc/shared/resume-review";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  generateResumeStructured: vi.fn(),
  generateStructuredWithMastraAgent: vi.fn(),
  parseResumeFast: vi.fn(),
  putObjectBytes: vi.fn(),
  resumeHardFilterAgent: { id: "resume-hard-filter-agent" },
  resumeReviewQualitativeAgent: { id: "resume-review-qualitative-agent" },
  resumeReviewScoringAgent: { id: "resume-review-scoring-agent" },
  sha256HexOfBytes: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => ({
    generateStructuredWithMastraAgent: mocks.generateStructuredWithMastraAgent,
    resumeHardFilterAgent: mocks.resumeHardFilterAgent,
    resumeReviewQualitativeAgent: mocks.resumeReviewQualitativeAgent,
    resumeReviewScoringAgent: mocks.resumeReviewScoringAgent,
  }),
);
vi.mock("@arc/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  generateResumeStructured: mocks.generateResumeStructured,
  parseResumeFast: mocks.parseResumeFast,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
  updateStructuredByHash: mocks.updateStructuredByHash,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { generateResumeReview } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: "candidate@example.com",
  gender: null,
  name: "候选人",
  personalStrengths: ["前端工程化"],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript", "React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

const PROFILE_WITH_DEGREE: ResumeProfile = {
  ...PROFILE,
  educationExperiences: [
    {
      degree: null,
      educationLevel: "本科",
      graduationYear: null,
      major: null,
      period: null,
      school: null,
      summary: null,
    },
  ],
};

// Agent 0 门槛提取输出（无硬性门槛）。
const HARD_FILTER_PASS = {
  minimumEducation: null,
  minimumWorkYears: null,
  requiredSkills: null,
  semanticRequirements: ["有从零到一建设经验"],
};

// Agent 0 门槛提取输出（学历不达标）。
const HARD_FILTER_FAIL = {
  minimumEducation: "硕士",
  minimumWorkYears: null,
  requiredSkills: null,
  semanticRequirements: null,
};

// Agent 1 定性输出 —— 不含 score / dimensions。
const QUALITATIVE_OUTPUT = {
  biasScan: { items: [] },
  levelRecommendation: {
    level: "中高级",
    rationale: "有 5 年前端经验和工程化背景",
  },
  nextStep: {
    action: "interview" as const,
    disclaimer: "以上为初步结论" as const,
    interviewFocus: ["项目复杂度", "核心成果口径"],
    rationale: "岗位匹配度较高",
  },
  overall: {
    conclusion: "候选人与前端工程师岗位匹配度较高。",
  },
  strengths: [
    {
      evidence: "简历列出 TypeScript 和 React 经验",
      impact: "能较快进入前端业务开发",
      point: "技术栈匹配",
    },
  ],
  teamPositioning: {
    rationale: "前端工程化和业务开发经验较集中",
    suggestion: "适合业务平台前端团队",
  },
  weaknesses: [
    {
      evidence: null,
      impact: "需要面试确认方案设计能力",
      point: "架构权衡证据不足",
    },
  ],
};

// Agent 2 打分输出 —— 只含产品六维评估框架。
const SCORING_OUTPUT = {
  dimensions: {
    educationBackground: { rationale: "本科背景符合岗位预期", score: 80 },
    experienceRelevance: { rationale: "前端业务经验与技术栈吻合", score: 90 },
    potential: { rationale: "经历体现工程广度和学习能力", score: 88 },
    projectMatch: { rationale: "核心项目复杂度和岗位要求对应", score: 82 },
    skillMatch: { rationale: "TypeScript/React 与岗位核心技能高度匹配", score: 92 },
    stability: { rationale: "职业经历较连贯，成果上下文仍需核实", score: 78 },
  },
};

// 组装后的期望结果 —— baseScore 由代码加权计算。
const EXPECTED_REVIEW: ResumeReview = {
  biasScan: QUALITATIVE_OUTPUT.biasScan,
  dimensions: SCORING_OUTPUT.dimensions,
  levelRecommendation: QUALITATIVE_OUTPUT.levelRecommendation,
  nextStep: QUALITATIVE_OUTPUT.nextStep,
  overall: {
    baseScore: 88,
    conclusion: "候选人与前端工程师岗位匹配度较高。",
    scoreRationale: "基于六维度按 35/25/15/10/8/7 加权得出基础分 88（不含历史面试加权）",
  },
  schemaVersion: 4,
  strengths: QUALITATIVE_OUTPUT.strengths,
  teamPositioning: QUALITATIVE_OUTPUT.teamPositioning,
  weaknesses: QUALITATIVE_OUTPUT.weaknesses,
};

// 三阶段 mock：Agent 0 (pass) → Agent 1 → Agent 2。
function mockThreeAgentPipeline() {
  mocks.generateStructuredWithMastraAgent
    .mockResolvedValueOnce(HARD_FILTER_PASS)
    .mockResolvedValueOnce(QUALITATIVE_OUTPUT)
    .mockResolvedValueOnce(SCORING_OUTPUT);
}

describe("generateResumeReview", () => {
  beforeEach(() => {
    mocks.generateStructuredWithMastraAgent.mockReset();
    vi.useRealTimers();
  });

  it("runs three-agent pipeline (hard filter pass + qualitative + scoring) and assembles v4 review", async () => {
    mockThreeAgentPipeline();

    const result = await generateResumeReview({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE_WITH_DEGREE,
    });

    expect(result.structuredReview).toEqual(EXPECTED_REVIEW);
    expect(result.structuredReview.overall.baseScore).toBe(88);
    expect(result.review).toBe(formatResumeReviewMarkdown(EXPECTED_REVIEW));
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(3);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ agent: mocks.resumeHardFilterAgent, schema: expect.any(Object) }),
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agent: mocks.resumeReviewQualitativeAgent,
        schema: expect.any(Object),
      }),
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        agent: mocks.resumeReviewScoringAgent,
        schema: expect.any(Object),
      }),
    );
  });

  it("injects current server time into resume review model prompts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    mockThreeAgentPipeline();

    await generateResumeReview({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE_WITH_DEGREE,
    });

    for (const call of mocks.generateStructuredWithMastraAgent.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          prompt: expect.stringContaining("当前服务端时间（Asia/Shanghai）"),
        }),
      );
      expect(call[0]).toEqual(
        expect.objectContaining({
          prompt: expect.stringContaining("2026年1月2日"),
        }),
      );
    }
  });

  it("skips Agent 1/2 when hard filter fails (short-circuit reject)", async () => {
    mocks.generateStructuredWithMastraAgent.mockResolvedValueOnce(HARD_FILTER_FAIL);

    const result = await generateResumeReview({
      jobDescription: "岗位要求硕士以上",
      resumeProfile: PROFILE_WITH_DEGREE,
    });

    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(1);
    expect(result.structuredReview.overall.baseScore).toBe(0);
    expect(result.structuredReview.nextStep.action).toBe("reject");
    expect(result.structuredReview.biasScan.items).toHaveLength(1);
    expect(result.structuredReview.biasScan.items[0].category).toBe("hard_gap");
    expect(result.structuredReview.biasScan.items[0].description).toContain("学历不达标");
  });

  it("skips hard filter entirely when no JD is provided", async () => {
    mocks.generateStructuredWithMastraAgent
      .mockResolvedValueOnce(QUALITATIVE_OUTPUT)
      .mockResolvedValueOnce(SCORING_OUTPUT);

    const result = await generateResumeReview({
      resumeProfile: PROFILE,
    });

    expect(result.structuredReview.overall.baseScore).toBe(88);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
    const prompt = mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain("产品六维评分框架");
    expect(prompt).not.toContain("岗位相关性维度");
  });
});
