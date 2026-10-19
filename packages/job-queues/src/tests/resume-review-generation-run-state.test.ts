import { describe, expect, it, vi } from "vitest";
import {
  buildResumeReviewGenerationJobId,
  getResumeReviewGenerationRunQueueState,
} from "../resume-review-generation";
import type { ResumeReviewGenerationJobLookup } from "../resume-review-generation";

const run = { jobDescriptionId: "jd-1", resumeRecordId: "record-1", runId: "run-1" };

function jobInState(state: string): ReturnType<ResumeReviewGenerationJobLookup> {
  return Promise.resolve({ getState: async () => await Promise.resolve(state) });
}

describe("getResumeReviewGenerationRunQueueState", () => {
  it("looks the run up by the same job id used when it was enqueued", async () => {
    const lookupJob = vi.fn<ResumeReviewGenerationJobLookup>().mockResolvedValue(null);

    await expect(getResumeReviewGenerationRunQueueState(run, lookupJob)).resolves.toBe("missing");

    expect(lookupJob).toHaveBeenCalledWith(
      buildResumeReviewGenerationJobId({ ...run, force: true, source: "reassess" }),
    );
  });

  it.each([
    ["waiting", "pending"],
    ["active", "pending"],
    ["delayed", "pending"],
    ["prioritized", "pending"],
    ["completed", "finished"],
    ["failed", "finished"],
    ["unknown", "missing"],
  ])("maps BullMQ state %s to %s", async (state, expected) => {
    const lookupJob = vi.fn<ResumeReviewGenerationJobLookup>(() => jobInState(state));

    await expect(getResumeReviewGenerationRunQueueState(run, lookupJob)).resolves.toBe(expected);
  });

  it("propagates Redis errors so callers can treat the state as unknown", async () => {
    const lookupJob = vi
      .fn<ResumeReviewGenerationJobLookup>()
      .mockRejectedValue(new Error("Connection is closed."));

    await expect(getResumeReviewGenerationRunQueueState(run, lookupJob)).rejects.toThrow(
      "Connection is closed.",
    );
  });
});
