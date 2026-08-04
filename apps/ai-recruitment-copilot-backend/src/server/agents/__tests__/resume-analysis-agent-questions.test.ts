import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  extractResumeDocumentText: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  generateResumeStructured: vi.fn(),
  generateStructuredWithMastraAgent: vi.fn(),
  interviewQuestionAgent: { id: "interview-question-agent" },
  parseResumeDocument: vi.fn(),
  parseResumeFast: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => ({
    generateStructuredWithMastraAgent: mocks.generateStructuredWithMastraAgent,
    interviewQuestionAgent: mocks.interviewQuestionAgent,
  }),
);
vi.mock("@arc/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  presignGetObjectUrl: vi.fn(),
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  extractResumeDocumentText: mocks.extractResumeDocumentText,
  generateResumeStructured: mocks.generateResumeStructured,
  parseResumeDocument: mocks.parseResumeDocument,
  parseResumeFast: mocks.parseResumeFast,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
  updateStructuredByHash: mocks.updateStructuredByHash,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import {
  generateInterviewQuestionsForProfile,
  streamGenerateInterviewQuestions,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "候选人",
  personalStrengths: ["工程化"],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

function questionDifficulty(index: number): "easy" | "hard" | "medium" {
  if (index < 3) {
    return "easy";
  }
  if (index < 7) {
    return "medium";
  }
  return "hard";
}

function questionText(index: number): string {
  if (index === 0) {
    return "请介绍一个你负责的前端项目。";
  }
  if (index === 1) {
    return "你如何设计组件状态管理？";
  }
  return `第 ${index + 1} 道面试题`;
}

const QUESTIONS_OUTPUT = {
  interviewQuestions: Array.from({ length: 10 }, (_, index) => ({
    difficulty: questionDifficulty(index),
    evaluationFocus: `第 ${index + 1} 题考核点`,
    followUpDirections: `第 ${index + 1} 题追问方向`,
    question: questionText(index),
  })),
};

async function readStreamEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
      if (!data) {
        throw new Error(`Missing SSE data frame: ${frame}`);
      }
      return JSON.parse(data) as { type: string; output?: unknown; stepId?: string };
    });
}

describe("resume interview question generation", () => {
  beforeEach(() => {
    mocks.generateStructuredWithMastraAgent.mockReset();
    mocks.generateStructuredWithMastraAgent.mockResolvedValue(QUESTIONS_OUTPUT);
  });

  it("uses structured output for blocking question generation", async () => {
    const result = await generateInterviewQuestionsForProfile(PROFILE);

    expect(result).toHaveLength(10);
    expect(result.slice(0, 2)).toEqual([
      {
        difficulty: "easy",
        evaluationFocus: "第 1 题考核点",
        followUpDirections: "第 1 题追问方向",
        order: 1,
        question: "请介绍一个你负责的前端项目。",
      },
      {
        difficulty: "easy",
        evaluationFocus: "第 2 题考核点",
        followUpDirections: "第 2 题追问方向",
        order: 2,
        question: "你如何设计组件状态管理？",
      },
    ]);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.interviewQuestionAgent,
        schema: expect.any(Object),
        temperature: 0.3,
      }),
    );
  });

  it("uses structured output for streaming question generation", async () => {
    const events = await readStreamEvents(streamGenerateInterviewQuestions(PROFILE));

    const result = events.find((event) => event.type === "run.completed")?.output as {
      interviewQuestions?: unknown[];
    };
    expect(result.interviewQuestions).toHaveLength(10);
    expect(result.interviewQuestions?.slice(0, 2)).toEqual([
      {
        difficulty: "easy",
        evaluationFocus: "第 1 题考核点",
        followUpDirections: "第 1 题追问方向",
        order: 1,
        question: "请介绍一个你负责的前端项目。",
      },
      {
        difficulty: "easy",
        evaluationFocus: "第 2 题考核点",
        followUpDirections: "第 2 题追问方向",
        order: 2,
        question: "你如何设计组件状态管理？",
      },
    ]);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.interviewQuestionAgent,
        schema: expect.any(Object),
        temperature: 0.3,
      }),
    );
    expect(events.some((event) => event.type === "result" || event.type === "text-delta")).toBe(
      false,
    );
    expect(events.some((event) => event.type === "step.started")).toBe(true);
  });
});
