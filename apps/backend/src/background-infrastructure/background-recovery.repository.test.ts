import { describe, expect, it, vi } from "vitest";
import type { CandidateRecoveryCommands } from "../domains/candidate-lifecycle/public.js";
import type { MeetingRecoveryCommands } from "../domains/meetings/public.js";
import { BackgroundRecoveryRepository } from "./background-recovery.repository.js";

describe("BackgroundRecoveryRepository", () => {
  it("delegates every recovery operation to its owning domain", async () => {
    const candidateRecovery = {
      listRecoverableResumeParseJobs: vi.fn(async () => []),
      listRecoverableResumeSemanticIndexJobs: vi.fn(async () => []),
    } satisfies CandidateRecoveryCommands;
    const meetingRecovery = {
      listRecoverableMeetingAnswerJobs: vi.fn(async () => []),
      listRecoverableMeetingIntelligenceJobs: vi.fn(async () => []),
      listRecoverableMeetingPlaybackJobs: vi.fn(async () => []),
      listRecoverableMeetingPurgeJobs: vi.fn(async () => []),
      listRecoverableMeetingTranscriptionJobs: vi.fn(async () => []),
      recoverMissingMeetingIntelligence: vi.fn(() => Promise.resolve()),
    } satisfies MeetingRecoveryCommands;
    const repository = new BackgroundRecoveryRepository(candidateRecovery, meetingRecovery);
    const now = new Date("2026-09-01T00:00:00.000Z");

    await Promise.all([
      repository.listRecoverableResumeParseJobs(),
      repository.listRecoverableResumeSemanticIndexJobs(),
      repository.listRecoverableMeetingAnswerJobs(),
      repository.listRecoverableMeetingIntelligenceJobs(),
      repository.listRecoverableMeetingPlaybackJobs(),
      repository.listRecoverableMeetingPurgeJobs(now),
      repository.listRecoverableMeetingTranscriptionJobs(),
      repository.recoverMissingMeetingIntelligence(),
    ]);

    expect(candidateRecovery.listRecoverableResumeParseJobs).toHaveBeenCalledOnce();
    expect(candidateRecovery.listRecoverableResumeSemanticIndexJobs).toHaveBeenCalledOnce();
    expect(meetingRecovery.listRecoverableMeetingAnswerJobs).toHaveBeenCalledOnce();
    expect(meetingRecovery.listRecoverableMeetingIntelligenceJobs).toHaveBeenCalledOnce();
    expect(meetingRecovery.listRecoverableMeetingPlaybackJobs).toHaveBeenCalledOnce();
    expect(meetingRecovery.listRecoverableMeetingPurgeJobs).toHaveBeenCalledWith(now);
    expect(meetingRecovery.listRecoverableMeetingTranscriptionJobs).toHaveBeenCalledOnce();
    expect(meetingRecovery.recoverMissingMeetingIntelligence).toHaveBeenCalledOnce();
  });
});
