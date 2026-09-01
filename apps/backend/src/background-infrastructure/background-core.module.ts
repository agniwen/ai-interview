/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import {
  BACKGROUND_DATABASE,
  BACKGROUND_DATABASE_CONNECTION,
} from "../infrastructure/database/database.tokens.js";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";
import { BackgroundCoreInfrastructureService } from "./background-core.service.js";
import { BackgroundRecoveryRepository } from "./background-recovery.repository.js";
import { BackgroundObjectStorageService } from "./background-object-storage.service.js";
import { MeetingOperationsRepository } from "./meeting-operations.repository.js";
import { MeetingPlaybackRepository } from "./meeting-playback.repository.js";
import { MeetingIntelligenceRecoveryService } from "./meeting-intelligence-recovery.service.js";
import { InterviewNotificationInfrastructure } from "./interview-notification.repository.js";
import { MailIngestInfrastructure } from "./mail-ingest.repository.js";
import { MeetingPurgeInfrastructure } from "./meeting-purge.repository.js";
import { MeetingAnswerInfrastructure } from "./meeting-answer.repository.js";
import { ResumeSemanticInfrastructure } from "./resume-semantic.repository.js";
import { MeetingIntelligenceInfrastructure } from "./meeting-intelligence.repository.js";
import { MeetingTranscriptionInfrastructure } from "./meeting-transcription.repository.js";
import { ResumeParseInfrastructure } from "./resume-parse.repository.js";
import { ResumeReviewInfrastructure } from "./resume-review.repository.js";

export const BACKGROUND_CORE_INFRASTRUCTURE = Symbol("BACKGROUND_CORE_INFRASTRUCTURE");

@Module({
  exports: [
    BACKGROUND_CORE_INFRASTRUCTURE,
    BackgroundRecoveryRepository,
    BackgroundObjectStorageService,
    MeetingOperationsRepository,
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
  providers: [
    {
      provide: BackgroundObjectStorageService,
      useFactory() {
        return new BackgroundObjectStorageService();
      },
    },
    {
      inject: [
        BACKGROUND_DATABASE,
        BackgroundObjectStorageService,
        MeetingIntelligenceRecoveryService,
      ],
      provide: MeetingTranscriptionInfrastructure,
      useFactory(
        database: Database,
        storage: BackgroundObjectStorageService,
        intelligenceRecovery: MeetingIntelligenceRecoveryService,
      ) {
        return new MeetingTranscriptionInfrastructure(database, storage, intelligenceRecovery);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, BackgroundObjectStorageService],
      provide: ResumeParseInfrastructure,
      useFactory(database: Database, storage: BackgroundObjectStorageService) {
        return new ResumeParseInfrastructure(database, storage);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: ResumeReviewInfrastructure,
      useFactory(database: Database) {
        return new ResumeReviewInfrastructure(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: MeetingIntelligenceInfrastructure,
      useFactory(database: Database) {
        return new MeetingIntelligenceInfrastructure(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: ResumeSemanticInfrastructure,
      useFactory(database: Database) {
        return new ResumeSemanticInfrastructure(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: MeetingAnswerInfrastructure,
      useFactory(database: Database) {
        return new MeetingAnswerInfrastructure(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, BackgroundObjectStorageService],
      provide: MailIngestInfrastructure,
      useFactory(database: Database, storage: BackgroundObjectStorageService) {
        return new MailIngestInfrastructure(database, storage);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, BackgroundObjectStorageService],
      provide: MeetingPurgeInfrastructure,
      useFactory(database: Database, storage: BackgroundObjectStorageService) {
        return new MeetingPurgeInfrastructure(database, storage);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: InterviewNotificationInfrastructure,
      useFactory(database: Database) {
        return new InterviewNotificationInfrastructure(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: BackgroundRecoveryRepository,
      useFactory(database: Database) {
        return new BackgroundRecoveryRepository(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: MeetingOperationsRepository,
      useFactory(database: Database) {
        return new MeetingOperationsRepository(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE],
      provide: MeetingPlaybackRepository,
      useFactory(database: Database) {
        return new MeetingPlaybackRepository(database);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, BackgroundRecoveryRepository],
      provide: MeetingIntelligenceRecoveryService,
      useFactory(database: Database, recovery: BackgroundRecoveryRepository) {
        return new MeetingIntelligenceRecoveryService(database, recovery);
      },
    },
    {
      inject: [
        BACKGROUND_DATABASE_CONNECTION,
        BackgroundRecoveryRepository,
        MeetingOperationsRepository,
      ],
      provide: BACKGROUND_CORE_INFRASTRUCTURE,
      useFactory(
        connection: DatabaseConnection,
        recovery: BackgroundRecoveryRepository,
        operations: MeetingOperationsRepository,
      ) {
        return new BackgroundCoreInfrastructureService(connection, recovery, operations);
      },
    },
  ],
})
export class BackgroundCoreInfrastructureModule {}
