import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  createResumeAnalysisWorkflow,
  runResumeAnalysisWorkflow,
} from "@app/server/server/agents/mastra/workflows/resume-analysis-workflow";

const generateQuestions = vi.fn();
const parseResume = vi.fn();

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
    generateQuestions.mockReset();
    parseResume.mockReset();
  });

  it("parses resume bytes and generates interview questions", async () => {
    parseResume.mockResolvedValue({
      parsedText: "候选人简历文本",
      resumeProfile: PROFILE,
    });
    generateQuestions.mockResolvedValue([
      { difficulty: "medium", order: 1, question: "请介绍一个 TypeScript 项目。" },
    ]);
    const workflow = createResumeAnalysisWorkflow({ generateQuestions, parseResume });

    const result = await runResumeAnalysisWorkflow(
      {
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "resume.pdf",
        mediaType: "application/pdf",
      },
      workflow,
    );

    expect(result).toEqual({
      fileName: "resume.pdf",
      interviewQuestions: [
        { difficulty: "medium", order: 1, question: "请介绍一个 TypeScript 项目。" },
      ],
      resumeProfile: PROFILE,
      resumeText: "候选人简历文本",
    });
    expect(parseResume).toHaveBeenCalledWith({
      bytes: Buffer.from([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });
    expect(generateQuestions).toHaveBeenCalledWith(PROFILE);
  });
});
