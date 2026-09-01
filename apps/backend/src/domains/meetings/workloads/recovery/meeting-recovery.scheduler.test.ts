import { describe, expect, it, vi } from "vitest";
import { MeetingRecoveryScheduler } from "./meeting-recovery.scheduler.js";

function createScheduler() {
  const intervals = new Map<string, NodeJS.Timeout>();
  const registry = {
    addInterval: vi.fn((name: string, interval: NodeJS.Timeout) => intervals.set(name, interval)),
    deleteInterval: vi.fn((name: string) => {
      clearInterval(intervals.get(name));
      intervals.delete(name);
    }),
    doesExist: vi.fn((_type: string, name: string) => intervals.has(name)),
  };
  const recovery = {
    listRecoverableMeetingAnswerJobs: vi.fn(async () => [{ exchangeId: "exchange-1" }]),
    listRecoverableMeetingIntelligenceJobs: vi.fn(async () => [{ processingRunId: "run-1" }]),
    listRecoverableMeetingPlaybackJobs: vi.fn(async () => [
      { meetingId: "meeting-1", organizationId: "org-1" },
    ]),
    listRecoverableMeetingPurgeJobs: vi.fn(async () => [
      { meetingId: "meeting-2", organizationId: "org-1" },
    ]),
    listRecoverableMeetingTranscriptionJobs: vi.fn(async () => []),
    recoverMissingMeetingIntelligence: vi.fn(() => Promise.resolve()),
  };
  const queueProducer = {
    enqueueMeetingAnswerJobs: vi.fn(() => Promise.resolve()),
    enqueueMeetingIntelligenceJobs: vi.fn(() => Promise.resolve()),
    enqueueMeetingPlaybackJobs: vi.fn(() => Promise.resolve()),
    enqueueMeetingPurgeJobs: vi.fn(() => Promise.resolve()),
    enqueueMeetingTranscriptionJobs: vi.fn(() => Promise.resolve()),
  };
  // SAFETY: these focused mocks implement every dependency method exercised by the scheduler.
  const scheduler = new MeetingRecoveryScheduler(
    registry as never,
    recovery,
    queueProducer as never,
    { get: vi.fn(() => 60_000) } as never,
  );
  return { intervals, queueProducer, recovery, registry, scheduler };
}

describe("MeetingRecoveryScheduler", () => {
  it("runs and schedules each enabled meeting recovery without overlap state leaking centrally", async () => {
    const subject = createScheduler();

    await subject.scheduler.start({ transcription: true });

    expect(subject.registry.addInterval).toHaveBeenCalledTimes(5);
    expect(subject.recovery.recoverMissingMeetingIntelligence).toHaveBeenCalledOnce();
    expect(subject.queueProducer.enqueueMeetingAnswerJobs).toHaveBeenCalledOnce();
    expect(subject.queueProducer.enqueueMeetingIntelligenceJobs).toHaveBeenCalledOnce();
    expect(subject.queueProducer.enqueueMeetingPlaybackJobs).toHaveBeenCalledOnce();
    expect(subject.queueProducer.enqueueMeetingPurgeJobs).toHaveBeenCalledOnce();
    expect(subject.queueProducer.enqueueMeetingTranscriptionJobs).toHaveBeenCalledOnce();
    expect(subject.scheduler.getSnapshot()["meeting-answer"]).toMatchObject({
      lastRecoveredCount: 1,
      running: false,
    });

    await subject.scheduler.close();
    expect(subject.intervals.size).toBe(0);
  });

  it("does not run or schedule transcription when the provider is disabled", async () => {
    const subject = createScheduler();

    await subject.scheduler.start({ transcription: false });

    expect(subject.registry.addInterval).toHaveBeenCalledTimes(4);
    expect(subject.recovery.listRecoverableMeetingTranscriptionJobs).not.toHaveBeenCalled();
    expect(subject.queueProducer.enqueueMeetingTranscriptionJobs).not.toHaveBeenCalled();
    await subject.scheduler.close();
  });
});
