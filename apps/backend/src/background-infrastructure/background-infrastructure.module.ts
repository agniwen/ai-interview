/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueProducerService } from "../background/background-queue-producer.service.js";
import { BackgroundQueueModule } from "../background/background-queue.module.js";
import { MIGRATED_BACKGROUND_WORKLOAD_ADAPTER } from "../background-workloads/background-workload.infrastructure.module.js";
import { createMigratedBackgroundWorkloadAdapter } from "../background-workloads/compose-background-workload.ports.js";
import { WORKLOAD_OBJECT_STORAGE } from "../infrastructure/object-storage/workload-object-storage.port.js";
import type { WorkloadObjectStorage } from "../infrastructure/object-storage/workload-object-storage.port.js";
import { InterviewNotificationInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/interview-notification.repository.js";
import { MailIngestInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/mail-ingest.repository.js";
import { ResumeParseInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/resume-parse.repository.js";
import { ResumeReviewInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/resume-review.repository.js";
import { ResumeSemanticInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/resume-semantic.repository.js";
import { MeetingAnswerInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-answer.repository.js";
import { MeetingIntelligenceInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-intelligence.repository.js";
import {
  createMeetingPlaybackInfrastructure,
  MeetingPlaybackRepository,
} from "../domains/meetings/workloads/infrastructure/meeting-playback.repository.js";
import { MeetingPurgeInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-purge.repository.js";
import { MeetingTranscriptionInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-transcription.repository.js";
import { CandidateRecoveryModule } from "../domains/candidate-lifecycle/workloads/recovery/candidate-recovery.module.js";
import { MeetingRecoveryModule } from "../domains/meetings/workloads/recovery/meeting-recovery.module.js";
import {
  BACKGROUND_CORE_INFRASTRUCTURE,
  BackgroundCoreInfrastructureModule,
} from "./background-core.module.js";
import type { BackgroundCoreInfrastructureService } from "./background-core.service.js";
import { createBackgroundCoreBindings } from "./background-core.bindings.js";
import { BackgroundRecoveryRepository } from "./background-recovery.repository.js";

@Module({
  exports: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER, CandidateRecoveryModule, MeetingRecoveryModule],
  imports: [
    BackgroundCoreInfrastructureModule,
    BackgroundQueueModule,
    CandidateRecoveryModule,
    MeetingRecoveryModule,
  ],
  providers: [
    {
      inject: [
        BACKGROUND_CORE_INFRASTRUCTURE,
        BackgroundRecoveryRepository,
        WORKLOAD_OBJECT_STORAGE,
        MeetingPlaybackRepository,
        InterviewNotificationInfrastructure,
        MailIngestInfrastructure,
        MeetingPurgeInfrastructure,
        MeetingAnswerInfrastructure,
        ResumeSemanticInfrastructure,
        MeetingIntelligenceInfrastructure,
        MeetingTranscriptionInfrastructure,
        ResumeParseInfrastructure,
        ResumeReviewInfrastructure,
        BackgroundQueueProducerService,
      ],
      provide: MIGRATED_BACKGROUND_WORKLOAD_ADAPTER,
      useFactory(
        core: BackgroundCoreInfrastructureService,
        recovery: BackgroundRecoveryRepository,
        storage: WorkloadObjectStorage,
        playback: MeetingPlaybackRepository,
        notifications: InterviewNotificationInfrastructure,
        mail: MailIngestInfrastructure,
        purge: MeetingPurgeInfrastructure,
        answer: MeetingAnswerInfrastructure,
        semantic: ResumeSemanticInfrastructure,
        intelligence: MeetingIntelligenceInfrastructure,
        transcription: MeetingTranscriptionInfrastructure,
        resumeParse: ResumeParseInfrastructure,
        review: ResumeReviewInfrastructure,
        queueProducer: BackgroundQueueProducerService,
      ) {
        const bindings = createBackgroundCoreBindings(core);
        return createMigratedBackgroundWorkloadAdapter({
          base: {
            ...bindings.base,
            resumeReviewGeneration: {
              process: (data, context) => review.process(data, context),
            },
          },
          interviewNotifications: notifications,
          mailIngest: mail,
          meetingAnswer: {
            listRecoverable: () => recovery.listRecoverableMeetingAnswerJobs(),
            processor: answer,
          },
          meetingIntelligence: {
            listRecoverable: () => recovery.listRecoverableMeetingIntelligenceJobs(),
            processor: intelligence,
            recoverMissing: () => recovery.recoverMissingMeetingIntelligence(),
          },
          meetingPlayback: {
            listRecoverable: () => recovery.listRecoverableMeetingPlaybackJobs(),
            processor: createMeetingPlaybackInfrastructure({
              queueProducer,
              recovery,
              repository: playback,
              storage,
            }),
          },
          meetingPurge: {
            listRecoverable: () => recovery.listRecoverableMeetingPurgeJobs(),
            processor: purge,
          },
          meetingTranscription: {
            listRecoverable: () => recovery.listRecoverableMeetingTranscriptionJobs(),
            processor: transcription.ports(),
          },
          resumeParse: {
            listRecoverable: () => recovery.listRecoverableResumeParseJobs(),
            processor: resumeParse,
          },
          resumeSemanticIndex: {
            listRecoverable: () => recovery.listRecoverableResumeSemanticIndexJobs(),
            processor: semantic,
          },
        });
      },
    },
  ],
})
export class BackgroundInfrastructureModule {}
