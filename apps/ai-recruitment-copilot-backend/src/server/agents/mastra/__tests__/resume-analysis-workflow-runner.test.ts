import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

const mocks = vi.hoisted(() => ({
  generateQuestions: vi.fn(),
  parseResume: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  generateInterviewQuestionsForProfile: mocks.generateQuestions,
  parseResumeBytesToProfile: mocks.parseResume,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { runResumeAnalysisWorkflow } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-analysis-workflow";

const PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: "candidate@example.com",
  gender: null,
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

describe("runResumeAnalysisWorkflow", () => {
  beforeEach(() => {
    mocks.generateQuestions.mockReset();
    mocks.parseResume.mockReset();
  });

  it("parses resume bytes and generates interview questions", async () => {
    mocks.parseResume.mockResolvedValue({
      parsedText: "候选人简历文本",
      resumeProfile: PROFILE,
    });
    mocks.generateQuestions.mockResolvedValue([
      { difficulty: "medium", order: 1, question: "请介绍一个 TypeScript 项目。" },
    ]);

    const result = await runResumeAnalysisWorkflow({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(result).toEqual({
      fileName: "resume.pdf",
      interviewQuestions: [
        { difficulty: "medium", order: 1, question: "请介绍一个 TypeScript 项目。" },
      ],
      resumeProfile: PROFILE,
      resumeText: "候选人简历文本",
    });
    expect(mocks.parseResume).toHaveBeenCalledWith({
      bytes: Buffer.from([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });
    expect(mocks.generateQuestions).toHaveBeenCalledWith(PROFILE);
  });
});
