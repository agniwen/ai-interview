import { describe, expect, it, vi } from "vitest";
import { CandidateRecoveryScheduler } from "./candidate-recovery.scheduler.js";

function createScheduler(semanticEnabled: boolean) {
  const recovery = {
    listRecoverableResumeParseJobs: vi.fn(async () => [
      { batchId: "batch-1", itemId: "item-1", organizationId: "org-1", userId: "user-1" },
    ]),
    listRecoverableResumeSemanticIndexJobs: vi.fn(async () => [
      { organizationId: "org-1", sourceId: "resume-1", sourceType: "studio_interview" as const },
    ]),
  };
  const queueProducer = {
    enqueueResumeParseJobs: vi.fn(() => Promise.resolve()),
    enqueueResumeSemanticIndexJobs: vi.fn(() => Promise.resolve()),
  };
  // SAFETY: these focused mocks implement every dependency method exercised by the scheduler.
  const scheduler = new CandidateRecoveryScheduler(
    recovery,
    queueProducer as never,
    { get: vi.fn(() => semanticEnabled) } as never,
  );
  return { queueProducer, recovery, scheduler };
}

describe("CandidateRecoveryScheduler", () => {
  it("recovers parse and enabled semantic work at startup", async () => {
    const subject = createScheduler(true);

    await subject.scheduler.start();

    expect(subject.queueProducer.enqueueResumeParseJobs).toHaveBeenCalledWith([
      { batchId: "batch-1", itemId: "item-1", organizationId: "org-1", userId: "user-1" },
    ]);
    expect(subject.queueProducer.enqueueResumeSemanticIndexJobs).toHaveBeenCalledOnce();
  });

  it("does not inspect semantic work when semantic indexing is disabled", async () => {
    const subject = createScheduler(false);

    await subject.scheduler.start();

    expect(subject.recovery.listRecoverableResumeSemanticIndexJobs).not.toHaveBeenCalled();
    expect(subject.queueProducer.enqueueResumeSemanticIndexJobs).not.toHaveBeenCalled();
  });
});
