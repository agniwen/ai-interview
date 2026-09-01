import type { BackgroundWorkloadPorts } from "../background-workloads/background-workload.ports.js";
import type { BackgroundCoreInfrastructureService } from "./background-core.service.js";

export interface BackgroundCoreBindings {
  base: Pick<
    BackgroundWorkloadPorts,
    "configuration" | "dependencies" | "meetingOperations" | "observability"
  >;
  recovery: {
    listRecoverableMeetingAnswerJobs: BackgroundWorkloadPorts["meetingAnswer"]["listRecoverable"];
    listRecoverableMeetingIntelligenceJobs: BackgroundWorkloadPorts["meetingIntelligence"]["listRecoverable"];
    listRecoverableMeetingPlaybackJobs: BackgroundWorkloadPorts["meetingPlayback"]["listRecoverable"];
    listRecoverableMeetingPurgeJobs: BackgroundWorkloadPorts["meetingPurge"]["listRecoverable"];
    listRecoverableMeetingTranscriptionJobs: BackgroundWorkloadPorts["meetingTranscription"]["listRecoverable"];
    listRecoverableResumeParseJobs: BackgroundWorkloadPorts["resumeParse"]["listRecoverable"];
    listRecoverableResumeSemanticIndexJobs: BackgroundWorkloadPorts["resumeSemanticIndex"]["listRecoverable"];
    recoverMissingMeetingIntelligence: BackgroundWorkloadPorts["meetingIntelligence"]["recoverMissing"];
  };
}

/** Binds the eleven real core infrastructure operations without losing `this`. */
export function createBackgroundCoreBindings(
  core: BackgroundCoreInfrastructureService,
): BackgroundCoreBindings {
  return {
    base: {
      configuration: { assertConfigured: () => core.assertConfigured() },
      dependencies: { ping: () => core.ping() },
      meetingOperations: { loadSnapshot: () => core.operations.loadSnapshot() },
      observability: { reportJobFailure: (failure) => core.reportJobFailure(failure) },
    },
    recovery: {
      listRecoverableMeetingAnswerJobs: () => core.recovery.listRecoverableMeetingAnswerJobs(),
      listRecoverableMeetingIntelligenceJobs: () =>
        core.recovery.listRecoverableMeetingIntelligenceJobs(),
      listRecoverableMeetingPlaybackJobs: () => core.recovery.listRecoverableMeetingPlaybackJobs(),
      listRecoverableMeetingPurgeJobs: () => core.recovery.listRecoverableMeetingPurgeJobs(),
      listRecoverableMeetingTranscriptionJobs: () =>
        core.recovery.listRecoverableMeetingTranscriptionJobs(),
      listRecoverableResumeParseJobs: () => core.recovery.listRecoverableResumeParseJobs(),
      listRecoverableResumeSemanticIndexJobs: () =>
        core.recovery.listRecoverableResumeSemanticIndexJobs(),
      recoverMissingMeetingIntelligence: () => core.recovery.recoverMissingMeetingIntelligence(),
    },
  };
}
