/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueProducerService } from "../background/background-queue-producer.service.js";
import { BackgroundQueueModule } from "../background/background-queue.module.js";
import {
  BACKGROUND_DATABASE,
  BACKGROUND_DATABASE_CONNECTION,
} from "../infrastructure/database/database.tokens.js";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";
import { BackendConfigService } from "../config/backend-config.service.js";
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
  imports: [BackgroundQueueModule.register()],
  providers: [
    {
      inject: [BackendConfigService],
      provide: BackgroundObjectStorageService,
      useFactory(config: BackendConfigService) {
        return new BackgroundObjectStorageService({
          S3_ACCESS_KEY_ID: config.get("S3_ACCESS_KEY_ID"),
          S3_BUCKET_NAME: config.get("S3_BUCKET_NAME"),
          S3_ENDPOINT: config.get("S3_ENDPOINT"),
          S3_FORCE_PATH_STYLE: config.get("S3_FORCE_PATH_STYLE"),
          S3_KEY_PREFIX: config.get("S3_KEY_PREFIX"),
          S3_REGION: config.get("S3_REGION"),
          S3_SECRET_ACCESS_KEY: config.get("S3_SECRET_ACCESS_KEY"),
        });
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
      inject: [BACKGROUND_DATABASE, BackgroundObjectStorageService, BackgroundQueueProducerService],
      provide: ResumeParseInfrastructure,
      useFactory(
        database: Database,
        storage: BackgroundObjectStorageService,
        queueProducer: BackgroundQueueProducerService,
      ) {
        return new ResumeParseInfrastructure(database, storage, queueProducer);
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
      inject: [BACKGROUND_DATABASE, BackgroundObjectStorageService, BackgroundQueueProducerService],
      provide: MailIngestInfrastructure,
      useFactory(
        database: Database,
        storage: BackgroundObjectStorageService,
        queueProducer: BackgroundQueueProducerService,
      ) {
        return new MailIngestInfrastructure(database, storage, queueProducer);
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
      inject: [BACKGROUND_DATABASE, BackgroundRecoveryRepository, BackgroundQueueProducerService],
      provide: MeetingIntelligenceRecoveryService,
      useFactory(
        database: Database,
        recovery: BackgroundRecoveryRepository,
        queueProducer: BackgroundQueueProducerService,
      ) {
        return new MeetingIntelligenceRecoveryService(database, recovery, queueProducer);
      },
    },
    {
      inject: [
        BACKGROUND_DATABASE_CONNECTION,
        BackgroundRecoveryRepository,
        MeetingOperationsRepository,
        BackendConfigService,
      ],
      provide: BACKGROUND_CORE_INFRASTRUCTURE,
      useFactory(
        connection: DatabaseConnection,
        recovery: BackgroundRecoveryRepository,
        operations: MeetingOperationsRepository,
        config: BackendConfigService,
      ) {
        return new BackgroundCoreInfrastructureService(connection, recovery, operations, {
          ALIBABA_API_KEY: config.get("ALIBABA_API_KEY"),
          BACKGROUND_WORKERS_ENABLED: config.get("BACKGROUND_WORKERS_ENABLED"),
          DATABASE_URL: config.get("DATABASE_URL"),
          MAIL_INGEST_ENABLED: config.get("MAIL_INGEST_ENABLED"),
          MAIL_INGEST_SECRET_KEY: config.get("MAIL_INGEST_SECRET_KEY"),
          MEETING_INTELLIGENCE_MODEL: config.get("MEETING_INTELLIGENCE_MODEL"),
          MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX: config.get(
            "MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX",
          ),
          MEETING_TRANSCRIPTION_QWEN_ENABLED: config.get("MEETING_TRANSCRIPTION_QWEN_ENABLED"),
          NODE_ENV: config.get("NODE_ENV"),
          QDRANT_URL: config.get("QDRANT_URL"),
          REDIS_URL: config.get("REDIS_URL"),
          RESUME_SEMANTIC_INDEX_ENABLED: config.get("RESUME_SEMANTIC_INDEX_ENABLED"),
          S3_ACCESS_KEY_ID: config.get("S3_ACCESS_KEY_ID"),
          S3_BUCKET_NAME: config.get("S3_BUCKET_NAME"),
          S3_ENDPOINT: config.get("S3_ENDPOINT"),
          S3_REGION: config.get("S3_REGION"),
          S3_SECRET_ACCESS_KEY: config.get("S3_SECRET_ACCESS_KEY"),
        });
      },
    },
  ],
})
export class BackgroundCoreInfrastructureModule {}
