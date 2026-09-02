import { describe, expect, it, vi } from "vitest";
import { runHumanInterviewEvaluationProcessing } from "./processor";

describe("runHumanInterviewEvaluationProcessing", () => {
  it("基于完整输入生成并发布可复核草稿", async () => {
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
            detailedAnalysis: "完整分析",
            evidenceTurnIds: ["turn-1"],
            overallEvaluation: "整体评价",
            professionalSkill: "优",
            rating: "A" as const,
            risks: "风险",
            rolePosition: "负责人",
            salaryRecommendation: "",
            seniorityPosition: "高级专家",
            strengths: "优势",
          }),
        ),
        loadInput: vi.fn(() =>
          Promise.resolve({
            candidateName: "候选人",
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
        meetingSessionId: "session-1",
        organizationId: "org-1",
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
  });
});
