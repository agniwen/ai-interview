import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview } from "@arc/shared/resume-review";
import { formatResumeReviewMarkdown } from "@arc/shared/resume-review";
import {
  composeResumeReviewResult,
  generateResumeReview,
  streamGenerateResumeReviewMarkdownFirst,
  streamGenerateResumeReview,
} from "../resume-analysis-agent";
import type { ResumeReviewGenerationDependencies } from "../resume-analysis-review";

const mocks = {
  generateStructuredWithMastraAgent: vi.fn(),
  resumeReviewMarkdownAgent: { id: "resume-review-markdown-agent", stream: vi.fn() },
  resumeReviewQualitativeAgent: { id: "resume-review-qualitative-agent" },
  resumeReviewScoringAgent: { id: "resume-review-scoring-agent" },
  streamTextWithMastraAgent: vi.fn(),
};

const dependencies: ResumeReviewGenerationDependencies = {
  generateQualitative: (prompt) =>
    mocks.generateStructuredWithMastraAgent({
      agent: mocks.resumeReviewQualitativeAgent,
      prompt,
      schema: {},
      temperature: 0,
    }),
  generateQualitativeFromMarkdown: (prompt) =>
    mocks.generateStructuredWithMastraAgent({
      agent: mocks.resumeReviewQualitativeAgent,
      prompt,
      schema: {},
      temperature: 0,
    }),
  generateScoring: (prompt) =>
    mocks.generateStructuredWithMastraAgent({
      agent: mocks.resumeReviewScoringAgent,
      prompt,
      schema: {},
      temperature: 0,
    }),
  streamMarkdown: (prompt) =>
    mocks.streamTextWithMastraAgent({
      agent: mocks.resumeReviewMarkdownAgent,
      maxOutputTokens: 1800,
      prompt,
      temperature: 0.4,
    }),
};

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

// 两阶段 mock：Agent 1 → Agent 2。硬性筛选结果由上游 policy evaluator 传入。
function mockThreeAgentPipeline() {
  mocks.generateStructuredWithMastraAgent
    .mockResolvedValueOnce(QUALITATIVE_OUTPUT)
    .mockResolvedValueOnce(SCORING_OUTPUT);
}

function mockMarkdownStream(chunks: string[]) {
  const textStream = async function* textStream() {
    for (const chunk of chunks) {
      yield chunk;
    }
  };
  mocks.resumeReviewMarkdownAgent.stream.mockResolvedValueOnce({
    textStream: textStream(),
  });
}

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

describe("generateResumeReview", () => {
  beforeEach(() => {
    mocks.generateStructuredWithMastraAgent.mockReset();
    mocks.resumeReviewMarkdownAgent.stream.mockReset();
    mocks.streamTextWithMastraAgent.mockReset();
    mocks.streamTextWithMastraAgent.mockImplementation(({ agent, prompt }) => ({
      async *[Symbol.asyncIterator]() {
        const result = await agent.stream(prompt);
        for await (const chunk of result.textStream) {
          yield chunk;
        }
      },
    }));
    vi.useRealTimers();
  });

  it("runs qualitative + scoring pipeline and assembles v4 review", async () => {
    mockThreeAgentPipeline();

    const result = await generateResumeReview(
      {
        jobDescription: "岗位名称：前端工程师",
        resumeProfile: PROFILE_WITH_DEGREE,
      },
      dependencies,
    );

    expect(result.structuredReview).toEqual(EXPECTED_REVIEW);
    expect(result.structuredReview.overall.baseScore).toBe(88);
    expect(result.review).toBe(formatResumeReviewMarkdown(EXPECTED_REVIEW));
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agent: mocks.resumeReviewQualitativeAgent,
        schema: expect.any(Object),
      }),
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agent: mocks.resumeReviewScoringAgent,
        schema: expect.any(Object),
      }),
    );
  });

  it("injects evidence-safe qualitative guidance and scoring anchors", async () => {
    mockThreeAgentPipeline();

    await generateResumeReview(
      {
        jobDescription: "岗位名称：前端工程师",
        resumeProfile: PROFILE_WITH_DEGREE,
      },
      dependencies,
    );

    const qualitativePrompt = mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt;
    const scoringPrompt = mocks.generateStructuredWithMastraAgent.mock.calls[1]?.[0]?.prompt;
    expect(qualitativePrompt).toContain("信息不足不等于不满足");
    expect(qualitativePrompt).toContain("不得仅因字段缺失直接建议 reject");
    expect(qualitativePrompt).toContain("相邻技术栈");
    expect(qualitativePrompt).toContain("优先 hold");
    expect(qualitativePrompt).toContain("action 必须为 hold，不得 reject");
    expect(qualitativePrompt).toContain("总体建议为 hold");
    expect(qualitativePrompt).toContain("action 必须为 hold");
    expect(qualitativePrompt).toContain("空数组只表示简历未提供记录");
    expect(qualitativePrompt).toContain("不得根据毕业年份与 workYears 的差值推断空档期");
    expect(qualitativePrompt).toContain("action 可为 interview 或 hold，但不得 reject");
    expect(scoringPrompt).toContain("85-100");
    expect(scoringPrompt).toContain("简历未提供学历层次");
    expect(scoringPrompt).toContain("React 与 TypeScript");
    expect(scoringPrompt).toContain("8 年以上前端架构经验");
    expect(scoringPrompt).toContain("score 5-20");
    expect(scoringPrompt).toContain("skillMatch 架构能力缺口");
    expect(scoringPrompt).toContain("score 20-35");
    expect(scoringPrompt).toContain("score 85-95");
    expect(scoringPrompt).toContain("potential 明确资深差距");
    expect(scoringPrompt).toContain("experienceRelevance 高潜初级");
    expect(scoringPrompt).toContain("screening hold 学历差距");
    expect(scoringPrompt).toContain("screening hold 技能证据不足");
    expect(scoringPrompt).toContain("证据安全规则优先于定性评价");
    expect(scoringPrompt).toContain("空数组只表示简历未提供记录");
    expect(scoringPrompt).toContain("educationBackground 学校声誉未知");
    expect(scoringPrompt).toContain("不得根据学校名称推断院校质量");
    expect(scoringPrompt).toContain("potential 高潜证据优先");
    expect(scoringPrompt).toContain("不得因工作经历字段为空重复扣分");
    expect(scoringPrompt).toContain("不得根据毕业年份与 workYears 的差值推断空档期");
    expect(scoringPrompt).toContain("projectMatch 场景直接匹配但技术栈相邻");
    expect(scoringPrompt).toContain("不得在 projectMatch 重复扣分");
    expect(scoringPrompt).toContain("experienceRelevance 同职业域相邻技术栈");
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.temperature).toBe(0);
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[1]?.[0]?.temperature).toBe(0);
  });

  it("rejects scoring output with unexpected top-level fields", () => {
    expect(() =>
      composeResumeReviewResult(QUALITATIVE_OUTPUT, {
        ...SCORING_OUTPUT,
        overall: { score: 88 },
      }),
    ).toThrow();
  });

  it("constrains markdown-first next step when screening recommends hold", async () => {
    mockMarkdownStream(["建议进入面试。"]);
    mocks.generateStructuredWithMastraAgent
      .mockResolvedValueOnce(QUALITATIVE_OUTPUT)
      .mockResolvedValueOnce(SCORING_OUTPUT);

    const events = await readStreamEvents(
      streamGenerateResumeReviewMarkdownFirst(
        {
          resumeProfile: PROFILE_WITH_DEGREE,
          screeningResult: {
            policyEmpty: false,
            policyEnabled: true,
            policyHash: "abc123",
            policyVersion: 2,
            recommendation: "hold",
            ruleResults: [],
          },
        },
        dependencies,
      ),
    );

    expect(events.find((event) => event.type === "run.completed")?.output).toMatchObject({
      structuredReview: { nextStep: { action: "hold" } },
    });
  });

  it("streams resume review workflow events as AiRun events", async () => {
    mockThreeAgentPipeline();

    const events = await readStreamEvents(
      streamGenerateResumeReview(
        {
          jobDescription: "岗位名称：前端工程师",
          resumeProfile: PROFILE_WITH_DEGREE,
        },
        dependencies,
      ),
    );

    expect(events).not.toContainEqual(
      expect.objectContaining({ stepId: "hard-filter", type: "step.started" }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ stepId: "compose-review", type: "step.completed" }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        artifactType: "resume.review.scoring",
        stepId: "scoring",
        type: "step.preview",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        stepId: "compose-review",
        text: formatResumeReviewMarkdown(EXPECTED_REVIEW),
        type: "step.delta",
      }),
    );
    expect(events.find((event) => event.type === "run.completed")?.output).toMatchObject({
      review: formatResumeReviewMarkdown(EXPECTED_REVIEW),
      structuredReview: EXPECTED_REVIEW,
    });
    expect(events.some((event) => event.type === "result" || event.type === "text-delta")).toBe(
      false,
    );
  });

  it("streams markdown first, then scores with the final markdown as context", async () => {
    const markdown = "## 简历评价\n候选人与前端工程师岗位匹配度较高。";
    mockMarkdownStream(["## 简历评价\n", "候选人与前端工程师岗位匹配度较高。"]);
    mocks.generateStructuredWithMastraAgent
      .mockResolvedValueOnce(QUALITATIVE_OUTPUT)
      .mockResolvedValueOnce(SCORING_OUTPUT);

    const events = await readStreamEvents(
      streamGenerateResumeReviewMarkdownFirst(
        {
          jobDescription: "岗位名称：前端工程师",
          resumeProfile: PROFILE_WITH_DEGREE,
        },
        dependencies,
      ),
    );

    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const deltaEvents = events.filter(
      (event) => event.type === "step.delta" && event.stepId === "markdown-review",
    ) as { text: string; type: string; stepId: string }[];
    expect(deltaEvents.map((event) => event.text).join("")).toBe(markdown);

    const firstDeltaIndex = events.findIndex(
      (event) => event.type === "step.delta" && event.stepId === "markdown-review",
    );
    const scoringPreviewIndex = events.findIndex(
      (event) => event.type === "step.preview" && event.stepId === "scoring",
    );
    expect(firstDeltaIndex).toBeGreaterThan(-1);
    expect(scoringPreviewIndex).toBeGreaterThan(firstDeltaIndex);

    expect(mocks.resumeReviewMarkdownAgent.stream).toHaveBeenCalledTimes(1);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        agent: mocks.resumeReviewQualitativeAgent,
        prompt: expect.stringContaining(markdown),
      }),
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        agent: mocks.resumeReviewScoringAgent,
        prompt: expect.stringContaining(markdown),
      }),
    );
    expect(events.find((event) => event.type === "run.completed")?.output).toMatchObject({
      review: markdown,
      structuredReview: EXPECTED_REVIEW,
    });
  });

  it("injects current server time into resume review model prompts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    mockThreeAgentPipeline();

    await generateResumeReview(
      {
        jobDescription: "岗位名称：前端工程师",
        resumeProfile: PROFILE_WITH_DEGREE,
      },
      dependencies,
    );

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

  it("injects confirmed screening result into review prompts without running hard filter", async () => {
    mockThreeAgentPipeline();

    const result = await generateResumeReview(
      {
        jobDescription: "岗位要求硕士以上",
        resumeProfile: PROFILE_WITH_DEGREE,
        screeningResult: {
          policyEmpty: false,
          policyEnabled: true,
          policyHash: "abc123",
          policyVersion: 2,
          recommendation: "hold",
          ruleResults: [
            {
              evidence: [],
              label: "最低学历：硕士",
              reason: "候选人学历未满足硕士及以上要求。",
              ruleId: "minimum-education",
              severity: "blocking",
              status: "fail",
              type: "field",
            },
          ],
        },
      },
      dependencies,
    );

    expect(result.structuredReview.overall.baseScore).toBe(88);
    expect(result.structuredReview.nextStep.action).toBe("hold");
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt).toContain(
      "已确认的简历筛选结果",
    );
    expect(mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt).toContain(
      "最低学历：硕士",
    );
  });

  it("skips hard filter entirely when no JD is provided", async () => {
    mocks.generateStructuredWithMastraAgent
      .mockResolvedValueOnce(QUALITATIVE_OUTPUT)
      .mockResolvedValueOnce(SCORING_OUTPUT);

    const result = await generateResumeReview(
      {
        resumeProfile: PROFILE,
      },
      dependencies,
    );

    expect(result.structuredReview.overall.baseScore).toBe(88);
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledTimes(2);
    const prompt = mocks.generateStructuredWithMastraAgent.mock.calls[0]?.[0]?.prompt;
    expect(prompt).toContain("产品六维评分框架");
    expect(prompt).not.toContain("岗位相关性维度");
  });
});
