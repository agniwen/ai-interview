import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  generateInterviewQuestionsForProfile,
  streamGenerateInterviewQuestions,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { InterviewQuestionGenerationDependencies } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const mocks = {
  generateStructuredWithMastraAgent: vi.fn(),
  interviewQuestionAgent: { id: "interview-question-agent" },
};

const dependencies: InterviewQuestionGenerationDependencies = {
  generateQuestions: (prompt) =>
    mocks.generateStructuredWithMastraAgent({
      agent: mocks.interviewQuestionAgent,
      prompt,
      schema: {},
      temperature: 0.3,
    }),
};

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
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      return JSON.parse(data) as { type: string; output?: unknown; stepId?: string };
    });
}

describe("resume interview question generation", () => {
  beforeEach(() => {
    mocks.generateStructuredWithMastraAgent.mockReset();
    mocks.generateStructuredWithMastraAgent.mockResolvedValue(QUESTIONS_OUTPUT);
  });

  it("uses structured output for blocking question generation", async () => {
    const result = await generateInterviewQuestionsForProfile(PROFILE, dependencies);

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
    const events = await readStreamEvents(streamGenerateInterviewQuestions(PROFILE, dependencies));

    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
