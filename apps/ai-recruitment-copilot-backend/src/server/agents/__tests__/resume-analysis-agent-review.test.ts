import { describe, expect, it, vi } from "vitest";
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

const STRUCTURED_REVIEW: ResumeReview = {
  biasScan: { items: [] },
  dimensions: {
    impactAndResults: { rationale: "有业务交付结果", score: 80 },
    roleRelevance: { rationale: "目标岗位和技能匹配", score: 88 },
    signalCredibility: { rationale: "关键成果仍需核实", score: 72 },
    structureReadability: { rationale: "简历结构清晰", score: 84 },
    technicalDepth: { rationale: "技术栈覆盖较完整", score: 82 },
  },
  levelRecommendation: {
    level: "中高级",
    rationale: "有 5 年前端经验和工程化背景",
  },
  nextStep: {
    action: "interview",
    disclaimer: "以上为初步结论",
    interviewFocus: ["项目复杂度", "核心成果口径"],
    rationale: "岗位匹配度较高",
  },
  overall: {
    conclusion: "候选人与前端工程师岗位匹配度较高。",
    score: 84,
    scoreRationale: "岗位相关性强，成果可信度需要面试核实。",
  },
  schemaVersion: 1,
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

describe("generateResumeReview", () => {
  it("returns structured review data and deterministic markdown notes", async () => {
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";
    mocks.createResumeAgent.mockReturnValue({
      generate: vi.fn().mockResolvedValue({
        text: JSON.stringify(STRUCTURED_REVIEW),
      }),
    });

    const result = await generateResumeReview({
      jobDescription: "岗位名称：前端工程师",
      resumeProfile: PROFILE,
    });

    expect(result.structuredReview).toEqual(STRUCTURED_REVIEW);
    expect(result.review).toBe(formatResumeReviewMarkdown(STRUCTURED_REVIEW));
  });
});
