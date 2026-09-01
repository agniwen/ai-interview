/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { MIGRATED_BACKGROUND_WORKLOAD_ADAPTER } from "../background-workloads/background-workload.infrastructure.module.js";
import { createMigratedBackgroundWorkloadAdapter } from "../background-workloads/compose-background-workload.ports.js";
import {
  BACKGROUND_CORE_INFRASTRUCTURE,
  BackgroundCoreInfrastructureModule,
} from "./background-core.module.js";
import type { BackgroundCoreInfrastructureService } from "./background-core.service.js";
import { createBackgroundCoreBindings } from "./background-core.bindings.js";
import { BackgroundObjectStorageService } from "./background-object-storage.service.js";
import { BackgroundRecoveryRepository } from "./background-recovery.repository.js";
import { InterviewNotificationInfrastructure } from "./interview-notification.repository.js";
import { MailIngestInfrastructure } from "./mail-ingest.repository.js";
import { MeetingAnswerInfrastructure } from "./meeting-answer.repository.js";
import { MeetingIntelligenceInfrastructure } from "./meeting-intelligence.repository.js";
import { MeetingIntelligenceRecoveryService } from "./meeting-intelligence-recovery.service.js";
import {
  createMeetingPlaybackInfrastructure,
  MeetingPlaybackRepository,
} from "./meeting-playback.repository.js";
import { MeetingPurgeInfrastructure } from "./meeting-purge.repository.js";
import { MeetingTranscriptionInfrastructure } from "./meeting-transcription.repository.js";
import { ResumeParseInfrastructure } from "./resume-parse.repository.js";
import { ResumeReviewInfrastructure } from "./resume-review.repository.js";
import { ResumeSemanticInfrastructure } from "./resume-semantic.repository.js";

@Module({
  exports: [MIGRATED_BACKGROUND_WORKLOAD_ADAPTER],
  imports: [BackgroundCoreInfrastructureModule],
  providers: [
    {
      inject: [
        BACKGROUND_CORE_INFRASTRUCTURE,
        BackgroundRecoveryRepository,
        BackgroundObjectStorageService,
        MeetingPlaybackRepository,
        MeetingIntelligenceRecoveryService,
        InterviewNotificationInfrastructure,
        MailIngestInfrastructure,
        MeetingPurgeInfrastructure,
        MeetingAnswerInfrastructure,
        ResumeSemanticInfrastructure,
        MeetingIntelligenceInfrastructure,
        MeetingTranscriptionInfrastructure,
        ResumeParseInfrastructure,
        ResumeReviewInfrastructure,
      ],
      provide: MIGRATED_BACKGROUND_WORKLOAD_ADAPTER,
      useFactory(
        core: BackgroundCoreInfrastructureService,
        recovery: BackgroundRecoveryRepository,
        storage: BackgroundObjectStorageService,
        playback: MeetingPlaybackRepository,
        intelligenceRecovery: MeetingIntelligenceRecoveryService,
        notifications: InterviewNotificationInfrastructure,
        mail: MailIngestInfrastructure,
        purge: MeetingPurgeInfrastructure,
        answer: MeetingAnswerInfrastructure,
        semantic: ResumeSemanticInfrastructure,
        intelligence: MeetingIntelligenceInfrastructure,
        transcription: MeetingTranscriptionInfrastructure,
        resumeParse: ResumeParseInfrastructure,
        review: ResumeReviewInfrastructure,
      ) {
        const bindings = createBackgroundCoreBindings(core, intelligenceRecovery);
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
            recoverMissing: () => intelligenceRecovery.recoverMissing(),
          },
          meetingPlayback: {
            listRecoverable: () => recovery.listRecoverableMeetingPlaybackJobs(),
            processor: createMeetingPlaybackInfrastructure({
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
