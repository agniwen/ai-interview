/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes. */
import { Module } from "@nestjs/common";
import { BackgroundQueueProducerService } from "../background/background-queue-producer.service.js";
import { BackgroundQueueModule } from "../background/background-queue.module.js";
import { BackendConfigModule } from "../config/backend-config.module.js";
import {
  BACKGROUND_DATABASE,
  BACKGROUND_DATABASE_CONNECTION,
} from "../infrastructure/database/database.tokens.js";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";
import { DatabaseModule } from "../infrastructure/database/database.module.js";
import { WORKLOAD_OBJECT_STORAGE } from "../infrastructure/object-storage/workload-object-storage.port.js";
import type { WorkloadObjectStorage } from "../infrastructure/object-storage/workload-object-storage.port.js";
import { BackendConfigService } from "../config/backend-config.service.js";
import { JOB_EVALUATION_SNAPSHOT_COMMANDS } from "../domains/jobs/public.js";
import type { JobEvaluationSnapshotCommands } from "../domains/jobs/public.js";
import { CANDIDATE_RECOVERY_COMMANDS } from "../domains/candidate-lifecycle/public.js";
import type { CandidateRecoveryCommands } from "../domains/candidate-lifecycle/public.js";
import { MEETING_RECOVERY_COMMANDS } from "../domains/meetings/public.js";
import type { MeetingRecoveryCommands } from "../domains/meetings/public.js";
import { JobEvaluationSnapshotModule } from "../domains/jobs/evaluation-snapshots/job-evaluation-snapshot.module.js";
import { CandidateRecoveryModule } from "../domains/candidate-lifecycle/workloads/recovery/candidate-recovery.module.js";
import { MeetingRecoveryModule } from "../domains/meetings/workloads/recovery/meeting-recovery.module.js";
import { InterviewNotificationInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/interview-notification.repository.js";
import { MailIngestInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/mail-ingest.repository.js";
import { ResumeParseInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/resume-parse.repository.js";
import { ResumeReviewInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/resume-review.repository.js";
import { ResumeSemanticInfrastructure } from "../domains/candidate-lifecycle/workloads/infrastructure/resume-semantic.repository.js";
import { MeetingAnswerInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-answer.repository.js";
import { MeetingIntelligenceInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-intelligence.repository.js";
import { MeetingOperationsRepository } from "../domains/meetings/workloads/infrastructure/meeting-operations.repository.js";
import { MeetingPlaybackRepository } from "../domains/meetings/workloads/infrastructure/meeting-playback.repository.js";
import { MeetingPurgeInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-purge.repository.js";
import { MeetingTranscriptionInfrastructure } from "../domains/meetings/workloads/infrastructure/meeting-transcription.repository.js";
import { BackgroundCoreInfrastructureService } from "./background-core.service.js";
import { BackgroundRecoveryRepository } from "./background-recovery.repository.js";
import { BackgroundObjectStorageService } from "./background-object-storage.service.js";

export const BACKGROUND_CORE_INFRASTRUCTURE = Symbol("BACKGROUND_CORE_INFRASTRUCTURE");

@Module({
  exports: [
    BACKGROUND_CORE_INFRASTRUCTURE,
    BackgroundRecoveryRepository,
    WORKLOAD_OBJECT_STORAGE,
    MeetingOperationsRepository,
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
  ],
  imports: [
    BackendConfigModule,
    BackgroundQueueModule,
    DatabaseModule,
    JobEvaluationSnapshotModule,
    CandidateRecoveryModule,
    MeetingRecoveryModule,
  ],
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
      provide: WORKLOAD_OBJECT_STORAGE,
      useExisting: BackgroundObjectStorageService,
    },
    {
      inject: [BACKGROUND_DATABASE, WORKLOAD_OBJECT_STORAGE, MEETING_RECOVERY_COMMANDS],
      provide: MeetingTranscriptionInfrastructure,
      useFactory(
        database: Database,
        storage: WorkloadObjectStorage,
        meetingRecovery: MeetingRecoveryCommands,
      ) {
        return new MeetingTranscriptionInfrastructure(database, storage, meetingRecovery);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, WORKLOAD_OBJECT_STORAGE, BackgroundQueueProducerService],
      provide: ResumeParseInfrastructure,
      useFactory(
        database: Database,
        storage: WorkloadObjectStorage,
        queueProducer: BackgroundQueueProducerService,
      ) {
        return new ResumeParseInfrastructure(database, storage, queueProducer);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, JOB_EVALUATION_SNAPSHOT_COMMANDS],
      provide: ResumeReviewInfrastructure,
      useFactory(database: Database, snapshots: JobEvaluationSnapshotCommands) {
        return new ResumeReviewInfrastructure(database, snapshots);
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
      inject: [BACKGROUND_DATABASE, WORKLOAD_OBJECT_STORAGE, BackgroundQueueProducerService],
      provide: MailIngestInfrastructure,
      useFactory(
        database: Database,
        storage: WorkloadObjectStorage,
        queueProducer: BackgroundQueueProducerService,
      ) {
        return new MailIngestInfrastructure(database, storage, queueProducer);
      },
    },
    {
      inject: [BACKGROUND_DATABASE, WORKLOAD_OBJECT_STORAGE],
      provide: MeetingPurgeInfrastructure,
      useFactory(database: Database, storage: WorkloadObjectStorage) {
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
      inject: [CANDIDATE_RECOVERY_COMMANDS, MEETING_RECOVERY_COMMANDS],
      provide: BackgroundRecoveryRepository,
      useFactory(
        candidateRecovery: CandidateRecoveryCommands,
        meetingRecovery: MeetingRecoveryCommands,
      ) {
        return new BackgroundRecoveryRepository(candidateRecovery, meetingRecovery);
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
