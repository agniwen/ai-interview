import { describe, expect, it, vi } from "vitest";
import {
  requestAutomaticHumanInterviewEvaluation,
  requestHumanInterviewEvaluationAfterTranscriptCorrection,
} from "./human-interview-evaluation-service";

describe("requestAutomaticHumanInterviewEvaluation", () => {
  it("does not mark an evaluation as generating when its queue is unavailable", async () => {
    const requestEvaluation = vi.fn();
    const isEvaluationQueueConfigured = vi.fn(() => false);

    await requestAutomaticHumanInterviewEvaluation(
      { meetingSessionId: "session-1", organizationId: "org-1" },
      {
        enqueueEvaluationJobs: vi.fn(),
        isEvaluationQueueConfigured,
        requestEvaluation,
      },
    );

    expect(isEvaluationQueueConfigured).toHaveBeenCalledOnce();
    expect(requestEvaluation).not.toHaveBeenCalled();
  });
});

describe("requestHumanInterviewEvaluationAfterTranscriptCorrection", () => {
  it("atomically claims the latest transcript and enqueues its evaluation", async () => {
    const job = {
      meetingSessionId: "session-1",
      organizationId: "org-1",
      roundId: "round-1",
      transcriptRevisionId: "revision-new",
    };
    const claimCorrectedEvaluation = vi.fn(() => Promise.resolve(job));
    const enqueueEvaluationJobs = vi.fn(() => Promise.resolve());

    await requestHumanInterviewEvaluationAfterTranscriptCorrection(
      { meetingSessionId: "session-1", organizationId: "org-1", roundId: "round-1" },
      {
        claimCorrectedEvaluation,
        enqueueEvaluationJobs,
        isEvaluationQueueConfigured: () => true,
      },
    );

    expect(claimCorrectedEvaluation).toHaveBeenCalledWith({
      meetingSessionId: "session-1",
      organizationId: "org-1",
      roundId: "round-1",
    });
    expect(enqueueEvaluationJobs).toHaveBeenCalledWith([job]);
  });
});
