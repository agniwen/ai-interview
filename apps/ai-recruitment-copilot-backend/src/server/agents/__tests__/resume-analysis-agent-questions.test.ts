import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";

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

async function* streamStartStep() {
  yield { type: "start-step" };
}

const QUESTIONS_OUTPUT = {
  interviewQuestions: Array.from({ length: 10 }, (_, index) => ({
    difficulty: questionDifficulty(index),
    question: questionText(index),
  })),
};

async function readStreamEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: unknown; index?: number });
}

describe("resume interview question generation", () => {
  beforeEach(() => {
    mocks.createResumeAgent.mockReset();
    process.env.ALIBABA_STRUCTURED_MODEL = "qwen-test";
  });

  it("uses structured output for blocking question generation", async () => {
    mocks.createResumeAgent.mockReturnValueOnce({
      generate: vi.fn().mockResolvedValue({ output: QUESTIONS_OUTPUT, text: "{}" }),
    });

    const result = await generateInterviewQuestionsForProfile(PROFILE);

    expect(result).toHaveLength(10);
    expect(result.slice(0, 2)).toEqual([
      { difficulty: "easy", order: 1, question: "请介绍一个你负责的前端项目。" },
      { difficulty: "easy", order: 2, question: "你如何设计组件状态管理？" },
    ]);
    expect(mocks.createResumeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.any(Object) }),
    );
  });

  it("uses structured output for streaming question generation", async () => {
    mocks.createResumeAgent.mockReturnValueOnce({
      stream: vi.fn().mockResolvedValue({
        output: Promise.resolve(QUESTIONS_OUTPUT),
        stream: streamStartStep(),
      }),
    });

    const events = await readStreamEvents(streamGenerateInterviewQuestions(PROFILE));

    const result = events.find((event) => event.type === "result")?.data as {
      interviewQuestions?: unknown[];
    };
    expect(result.interviewQuestions).toHaveLength(10);
    expect(result.interviewQuestions?.slice(0, 2)).toEqual([
      { difficulty: "easy", order: 1, question: "请介绍一个你负责的前端项目。" },
      { difficulty: "easy", order: 2, question: "你如何设计组件状态管理？" },
    ]);
    expect(mocks.createResumeAgent).toHaveBeenCalledWith(
      expect.objectContaining({ output: expect.any(Object) }),
    );
  });
});
