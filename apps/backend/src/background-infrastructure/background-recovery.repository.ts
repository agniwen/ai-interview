import type { CandidateRecoveryCommands } from "../domains/candidate-lifecycle/public.js";
import type { MeetingRecoveryCommands } from "../domains/meetings/public.js";

/**
 * Compatibility facade for the central workload adapter. Recovery state and writes
 * remain implemented by their owning domains.
 */
export class BackgroundRecoveryRepository {
  constructor(
    private readonly candidateRecovery: CandidateRecoveryCommands,
    private readonly meetingRecovery: MeetingRecoveryCommands,
  ) {}

  listRecoverableResumeParseJobs() {
    return this.candidateRecovery.listRecoverableResumeParseJobs();
  }

  listRecoverableResumeSemanticIndexJobs() {
    return this.candidateRecovery.listRecoverableResumeSemanticIndexJobs();
  }

  listRecoverableMeetingPlaybackJobs() {
    return this.meetingRecovery.listRecoverableMeetingPlaybackJobs();
  }

  listRecoverableMeetingPurgeJobs(now = new Date()) {
    return this.meetingRecovery.listRecoverableMeetingPurgeJobs(now);
  }

  listRecoverableMeetingAnswerJobs() {
    return this.meetingRecovery.listRecoverableMeetingAnswerJobs();
  }

  listRecoverableMeetingIntelligenceJobs() {
    return this.meetingRecovery.listRecoverableMeetingIntelligenceJobs();
  }

  listRecoverableMeetingTranscriptionJobs() {
    return this.meetingRecovery.listRecoverableMeetingTranscriptionJobs();
  }

  recoverMissingMeetingIntelligence() {
    return this.meetingRecovery.recoverMissingMeetingIntelligence();
  }
}
