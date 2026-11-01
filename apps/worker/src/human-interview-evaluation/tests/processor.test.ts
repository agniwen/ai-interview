import { describe, expect, it, vi } from "vitest";
import { runHumanInterviewEvaluationProcessing } from "../processor";

describe("runHumanInterviewEvaluationProcessing", () => {
  it.each(["A", null] as const)("基于完整输入生成并发布评级为 %s 的可复核草稿", async (rating) => {
    const publish = vi.fn(() => Promise.resolve(true));
    const notifyReady = vi.fn(() => Promise.resolve());
    await runHumanInterviewEvaluationProcessing(
      {
        meetingSessionId: "session-1",
        organizationId: "org-1",
        roundId: "round-1",
        transcriptRevisionId: "revision-1",
      },
      { attempt: 1, maxAttempts: 5 },
      {
        generate: vi.fn(() =>
          Promise.resolve({
            evaluation: {
              detailedAnalysis: "完整分析",
              evidenceTurnIds: ["turn-1"],
              overallEvaluation: "整体评价",
              professionalSkill: "优",
              rating,
              risks: "风险",
              rolePosition: "负责人",
              salaryRecommendation: "",
              seniorityPosition: "高级专家",
              strengths: "优势",
            },
            reviewFindings: [{ quote: "整体评价", reason: "评级依据未考察内容" }],
          }),
        ),
        loadInput: vi.fn(() =>
          Promise.resolve({
            candidateName: "候选人",
            internalCriteria: "需要行业经验",
            jobDescription: "JD",
            resume: "简历",
            turns: [
              {
                id: "turn-1",
                speakerDisplayName: null,
                speakerKey: "remote-1",
                text: "回答",
              },
            ],
          }),
        ),
        markFailed: vi.fn(() => Promise.resolve()),
        notifyReady,
        publish,
      },
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation: expect.objectContaining({ rating }),
        meetingSessionId: "session-1",
        organizationId: "org-1",
        reviewFindings: [{ quote: "整体评价", reason: "评级依据未考察内容" }],
        roundId: "round-1",
        transcriptRevisionId: "revision-1",
      }),
    );
    expect(notifyReady).toHaveBeenCalledWith(
      expect.objectContaining({ roundId: "round-1", transcriptRevisionId: "revision-1" }),
    );
  });

  it("retries the ready notification even when the evaluation was already published", async () => {
    const notifyReady = vi.fn(() => Promise.resolve());
    await runHumanInterviewEvaluationProcessing(
      {
        meetingSessionId: "session-1",
        organizationId: "org-1",
        roundId: "round-1",
        transcriptRevisionId: "revision-1",
      },
      { attempt: 2, maxAttempts: 5 },
      {
        generate: vi.fn(),
        loadInput: vi.fn(() => Promise.resolve(null)),
        markFailed: vi.fn(() => Promise.resolve()),
        notifyReady,
        publish: vi.fn(),
      },
    );

    expect(notifyReady).toHaveBeenCalledOnce();
  });

  it("中间失败保留 generating 状态给 BullMQ 重试，最后一次才标记 failed", async () => {
    const error = new Error("provider unavailable");
    const markFailed = vi.fn(() => Promise.resolve());
    const dependencies = {
      generate: vi.fn(() => Promise.reject(error)),
      loadInput: vi.fn(() =>
        Promise.resolve({
          candidateName: "候选人",
          internalCriteria: null,
          jobDescription: "JD",
          resume: "简历",
          turns: [],
        }),
      ),
      markFailed,
      notifyReady: vi.fn(() => Promise.resolve()),
      publish: vi.fn(() => Promise.resolve(true)),
    };

    await expect(
      runHumanInterviewEvaluationProcessing(
        {
          meetingSessionId: "session-1",
          organizationId: "org-1",
          roundId: "round-1",
          transcriptRevisionId: "revision-1",
        },
        { attempt: 1, maxAttempts: 5 },
        dependencies,
      ),
    ).rejects.toBe(error);
    expect(markFailed).not.toHaveBeenCalled();

    await runHumanInterviewEvaluationProcessing(
      {
        meetingSessionId: "session-1",
        organizationId: "org-1",
        roundId: "round-1",
        transcriptRevisionId: "revision-1",
      },
      { attempt: 5, maxAttempts: 5 },
      dependencies,
    );
    expect(markFailed).toHaveBeenCalledOnce();
    expect(dependencies.notifyReady).not.toHaveBeenCalled();
  });

  it("does not mark a published evaluation failed when its notification fails", async () => {
    const error = new Error("notification unavailable");
    const markFailed = vi.fn();
    await expect(
      runHumanInterviewEvaluationProcessing(
        {
          meetingSessionId: "session-1",
          organizationId: "org-1",
          roundId: "round-1",
          transcriptRevisionId: "revision-1",
        },
        { attempt: 5, maxAttempts: 5 },
        {
          generate: vi.fn(),
          loadInput: vi.fn(() => Promise.resolve(null)),
          markFailed,
          notifyReady: vi.fn(() => Promise.reject(error)),
          publish: vi.fn(),
        },
      ),
    ).rejects.toBe(error);
    expect(markFailed).not.toHaveBeenCalled();
  });
  it("输入永久不可用时只生成一次，立即告知人工复核", async () => {
    const markFailed = vi.fn(() => Promise.resolve());
    const generate = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error("真人复面转录尚未可靠识别候选人发言，不能生成 AI 评价"), {
          name: "HumanInterviewEvaluationInputError",
        }),
      ),
    );
    const notifyReady = vi.fn();
    await runHumanInterviewEvaluationProcessing(
      {
        meetingSessionId: "session-1",
        organizationId: "org-1",
        roundId: "round-1",
        transcriptRevisionId: "revision-1",
      },
      { attempt: 1, maxAttempts: 5 },
      {
        generate,
        loadInput: vi.fn(() =>
          Promise.resolve({
            candidateName: "候选人",
            internalCriteria: null,
            jobDescription: "JD",
            resume: "",
            turns: [],
          }),
        ),
        markFailed,
        notifyReady,
        publish: vi.fn(),
      },
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("尚未可靠识别候选人发言"),
      }),
    );
    expect(notifyReady).not.toHaveBeenCalled();
  });
});
