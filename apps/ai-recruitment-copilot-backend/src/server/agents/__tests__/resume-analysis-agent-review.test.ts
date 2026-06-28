import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview } from "@arc/shared/resume-review";
import { formatResumeReviewMarkdown } from "@arc/shared/resume-review";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  createResumeAgent: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  generateResumeStructured: vi.fn(),
  parseResumeFast: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock("../resume-agent", () => ({
  createResumeAgent: mocks.createResumeAgent,
}));
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

// Agent 2 打分输出 —— 只含共享五维评估框架。
const SCORING_OUTPUT = {
  dimensions: {
    impactResults: { rationale: "核心项目有明确业务结果", score: 92 },
    roleRelevance: { rationale: "岗位关键词和职责方向匹配", score: 82 },
    signalCredibility: { rationale: "成果上下文仍需核实", score: 78 },
    structureReadability: { rationale: "简历层级清晰", score: 80 },
    technicalDepth: { rationale: "TypeScript/React 与工程化经验充分", score: 90 },
  },
};

// 组装后的期望结果 —— baseScore 由代码加权计算。
const EXPECTED_REVIEW: ResumeReview = {
  biasScan: QUALITATIVE_OUTPUT.biasScan,
  dimensions: SCORING_OUTPUT.dimensions,
  levelRecommendation: QUALITATIVE_OUTPUT.levelRecommendation,
  nextStep: QUALITATIVE_OUTPUT.nextStep,
  overall: {
    baseScore: 86,
    conclusion: "候选人与前端工程师岗位匹配度较高。",
    scoreRationale: "基于五维度按 30/25/20/15/10 加权得出基础分 86（不含历史面试加权）",
  },
  schemaVersion: 3,
  strengths: QUALITATIVE_OUTPUT.strengths,
  teamPositioning: QUALITATIVE_OUTPUT.teamPositioning,
  weaknesses: QUALITATIVE_OUTPUT.weaknesses,
};

// 三阶段 mock：Agent 0 (pass) → Agent 1 → Agent 2。
function mockThreeAgentPipeline() {
  mocks.createResumeAgent
    .mockReturnValueOnce({
      generate: vi.fn().mockResolvedValue({ text: JSON.stringify(HARD_FILTER_PASS) }),
    })
    .mockReturnValueOnce({
      generate: vi.fn().mockResolvedValue({ text: JSON.stringify(QUALITATIVE_OUTPUT) }),
    })
    .mockReturnValueOnce({
      generate: vi.fn().mockResolvedValue({ text: JSON.stringify(SCORING_OUTPUT) }),
    });
}

describe("generateResumeReview", () => {
  beforeEach(() => {
    mocks.createResumeAgent.mockReset();
  });

  it("runs three-agent pipeline (hard filter pass + qualitative + scoring) and assembles v3 review", async () => {
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";
    mockThreeAgentPipeline();

    const result = await generateResumeReview({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE_WITH_DEGREE,
    });

    expect(result.structuredReview).toEqual(EXPECTED_REVIEW);
    expect(result.structuredReview.overall.baseScore).toBe(86);
    expect(result.review).toBe(formatResumeReviewMarkdown(EXPECTED_REVIEW));
    expect(mocks.createResumeAgent).toHaveBeenCalledTimes(3);
  });

  it("skips Agent 1/2 when hard filter fails (short-circuit reject)", async () => {
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";

    // Agent 0 返回硕士门槛，候选人是本科 → 违反。
    mocks.createResumeAgent.mockReturnValueOnce({
      generate: vi.fn().mockResolvedValue({ text: JSON.stringify(HARD_FILTER_FAIL) }),
    });

    const result = await generateResumeReview({
      jobDescription: "岗位要求硕士以上",
      resumeProfile: PROFILE_WITH_DEGREE,
    });

    // 只调了 Agent 0，没调 Agent 1/2。
    expect(mocks.createResumeAgent).toHaveBeenCalledTimes(1);
    expect(result.structuredReview.overall.baseScore).toBe(0);
    expect(result.structuredReview.nextStep.action).toBe("reject");
    expect(result.structuredReview.biasScan.items).toHaveLength(1);
    expect(result.structuredReview.biasScan.items[0].category).toBe("hard_gap");
    expect(result.structuredReview.biasScan.items[0].description).toContain("学历不达标");
  });

  it("skips hard filter entirely when no JD is provided", async () => {
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";

    // 无 JD → Agent 0 跳过，只 mock Agent 1 + Agent 2。
    mocks.createResumeAgent
      .mockReturnValueOnce({
        generate: vi.fn().mockResolvedValue({ text: JSON.stringify(QUALITATIVE_OUTPUT) }),
      })
      .mockReturnValueOnce({
        generate: vi.fn().mockResolvedValue({ text: JSON.stringify(SCORING_OUTPUT) }),
      });

    const result = await generateResumeReview({
      resumeProfile: PROFILE,
    });

    expect(result.structuredReview.overall.baseScore).toBe(86);
    expect(mocks.createResumeAgent).toHaveBeenCalledTimes(2);
  });
});
