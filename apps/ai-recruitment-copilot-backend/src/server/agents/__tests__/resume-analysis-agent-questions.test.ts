import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  generatedCandidateInterviewQuestionSlotsSchema,
  generatedCandidateInterviewQuestionsSchema,
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

function questionDifficulty(index: number): "hard" | "medium" {
  return index >= 7 ? "hard" : "medium";
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
    dimension: (
      [
        "business",
        "business",
        "ai_application",
        "team_management",
        "project_management",
        "soft_skills",
        "soft_skills",
        "business",
        "business",
        "business",
      ] as const
    )[index],
    evaluationFocus: `第 ${index + 1} 题考核点`,
    followUpDirections: `第 ${index + 1} 题追问方向`,
    question: questionText(index),
  })),
};

const QUESTION_SLOTS_OUTPUT = {
  interviewQuestions: {
    aiApplication: QUESTIONS_OUTPUT.interviewQuestions[2],
    businessHard1: QUESTIONS_OUTPUT.interviewQuestions[7],
    businessHard2: QUESTIONS_OUTPUT.interviewQuestions[8],
    businessHard3: QUESTIONS_OUTPUT.interviewQuestions[9],
    businessMedium1: QUESTIONS_OUTPUT.interviewQuestions[0],
    businessMedium2: QUESTIONS_OUTPUT.interviewQuestions[1],
    projectManagement: QUESTIONS_OUTPUT.interviewQuestions[4],
    softSkills1: QUESTIONS_OUTPUT.interviewQuestions[5],
    softSkills2: QUESTIONS_OUTPUT.interviewQuestions[6],
    teamManagement: QUESTIONS_OUTPUT.interviewQuestions[3],
  },
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
    mocks.generateStructuredWithMastraAgent.mockResolvedValue(QUESTION_SLOTS_OUTPUT);
  });

  it("uses structured output for blocking question generation", async () => {
    const result = await generateInterviewQuestionsForProfile(PROFILE, dependencies);

    expect(result).toHaveLength(10);
    expect(result.slice(0, 2)).toEqual([
      {
        difficulty: "medium",
        dimension: "business",
        evaluationFocus: "第 1 题考核点",
        followUpDirections: "第 1 题追问方向",
        order: 1,
        question: "请介绍一个你负责的前端项目。",
      },
      {
        difficulty: "medium",
        dimension: "business",
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
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      "5 道 business",
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      "恰好 2 道 medium、3 道 hard",
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      "简历没有相关经历或没有体现时，不得虚构、补全或暗示候选人做过",
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      "没有或未体现时，基于目标岗位的典型任务设置通用情境",
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      "没有正式管理经历或未体现时，不假设其带过团队",
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      '"businessMedium1"',
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt).toContain(
      "绑定岗位信息：未提供",
    );
  });

  it("prioritizes the bound recruiting job name and canonical JD", async () => {
    await generateInterviewQuestionsForProfile(PROFILE, dependencies, {
      job: {
        name: "招商主管",
        prompt: "负责商业项目招商、客户谈判和签约回款。",
      },
    });

    const prompt = mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("候选人可能来自技术、产品、运营、销售、职能、管理等不同岗位");
    expect(prompt).toContain('"jobName": "招商主管"');
    expect(prompt).toContain('"jobDescription": "负责商业项目招商、客户谈判和签约回款。"');
    expect(prompt).toContain("岗位名称和岗位 JD 是岗位匹配的最高优先级依据");
  });

  it("retries question generation at most once with a fixed-slot correction", async () => {
    mocks.generateStructuredWithMastraAgent
      .mockRejectedValueOnce(new Error("invalid structured output"))
      .mockResolvedValueOnce(QUESTION_SLOTS_OUTPUT);

    await expect(generateInterviewQuestionsForProfile(PROFILE, dependencies)).resolves.toHaveLength(
      10,
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[1]?.[0].prompt).toContain(
      "这是唯一一次重试",
    );
  });

  it("stops after one retry when question generation keeps failing", async () => {
    mocks.generateStructuredWithMastraAgent.mockRejectedValue(
      new Error("invalid structured output"),
    );

    await expect(generateInterviewQuestionsForProfile(PROFILE, dependencies)).rejects.toMatchObject(
      { stage: "question-generation" },
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
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
        difficulty: "medium",
        dimension: "business",
        evaluationFocus: "第 1 题考核点",
        followUpDirections: "第 1 题追问方向",
        order: 1,
        question: "请介绍一个你负责的前端项目。",
      },
      {
        difficulty: "medium",
        dimension: "business",
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

  it("enforces the exact dimension and difficulty matrix", () => {
    expect(generatedCandidateInterviewQuestionsSchema.safeParse(QUESTIONS_OUTPUT).success).toBe(
      true,
    );

    const wrongBusinessDifficulty = {
      interviewQuestions: QUESTIONS_OUTPUT.interviewQuestions.map((question, index) =>
        index === 0 ? { ...question, difficulty: "hard" as const } : question,
      ),
    };
    expect(
      generatedCandidateInterviewQuestionsSchema.safeParse(wrongBusinessDifficulty).success,
    ).toBe(false);

    const easyNonBusinessQuestion = {
      interviewQuestions: QUESTIONS_OUTPUT.interviewQuestions.map((question, index) =>
        index === 2 ? { ...question, difficulty: "easy" as const } : question,
      ),
    };
    expect(
      generatedCandidateInterviewQuestionsSchema.safeParse(easyNonBusinessQuestion).success,
    ).toBe(false);

    const wrongDimensionCount = {
      interviewQuestions: QUESTIONS_OUTPUT.interviewQuestions.map((question, index) =>
        index === 6 ? { ...question, dimension: "business" as const } : question,
      ),
    };
    expect(generatedCandidateInterviewQuestionsSchema.safeParse(wrongDimensionCount).success).toBe(
      false,
    );
  });

  it("enforces dimensions and business difficulty in the named generation slots", () => {
    expect(
      generatedCandidateInterviewQuestionSlotsSchema.safeParse(QUESTION_SLOTS_OUTPUT).success,
    ).toBe(true);

    const wrongAiSlot = {
      interviewQuestions: {
        ...QUESTION_SLOTS_OUTPUT.interviewQuestions,
        aiApplication: {
          ...QUESTION_SLOTS_OUTPUT.interviewQuestions.aiApplication,
          dimension: "business" as const,
        },
      },
    };
    expect(generatedCandidateInterviewQuestionSlotsSchema.safeParse(wrongAiSlot).success).toBe(
      false,
    );
  });
});
