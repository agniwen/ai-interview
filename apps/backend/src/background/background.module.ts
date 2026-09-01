/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes discovered through decorator metadata. */
import { Global, Module } from "@nestjs/common";
import type { DynamicModule, ModuleMetadata, Provider } from "@nestjs/common";
import { BullModule, BullRegistrar, getQueueToken } from "@nestjs/bullmq";
import {
  buildMeetingAnswerQueuePrefix,
  MEETING_ANSWER_QUEUE_NAME,
} from "@arc/meeting-processing-queue/meeting-answer";
import {
  buildMeetingIntelligenceQueuePrefix,
  MEETING_INTELLIGENCE_QUEUE_NAME,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  buildMeetingPlaybackQueuePrefix,
  MEETING_PLAYBACK_QUEUE_NAME,
} from "@arc/meeting-processing-queue/meeting-playback";
import {
  buildMeetingPurgeQueuePrefix,
  MEETING_PURGE_QUEUE_NAME,
} from "@arc/meeting-processing-queue/meeting-purge";
import {
  buildMeetingTranscriptionQueuePrefix,
  MEETING_TRANSCRIPTION_QUEUE_NAME,
} from "@arc/meeting-processing-queue/meeting-transcription";
import { MAIL_INGEST_TRIGGER_QUEUE_NAME } from "@arc/resume-parse-queue/mail-ingest-trigger";
import {
  buildResumeParseQueuePrefix,
  RESUME_PARSE_QUEUE_NAME,
} from "@arc/resume-parse-queue/resume-parse";
import { RESUME_REVIEW_GENERATION_QUEUE_NAME } from "@arc/resume-parse-queue/resume-review-generation";
import { RESUME_SEMANTIC_INDEX_QUEUE_NAME } from "@arc/resume-parse-queue/resume-semantic-index";
import { getBackgroundRedisConnection, isBackgroundWorkersEnabled } from "./background.config.js";
import {
  BackgroundDiagnosticsController,
  WorkerDiagnosticsGuard,
} from "./background.controller.js";
import { BackgroundDiagnosticsService } from "./background.diagnostics.js";
import { BACKGROUND_LIFECYCLE, BackgroundLifecycleService } from "./background.lifecycle.js";
import {
  BackgroundProcessorRegistry,
  MailIngestTriggerProcessor,
  MeetingAnswerProcessor,
  MeetingIntelligenceProcessor,
  MeetingPlaybackProcessor,
  MeetingPurgeProcessor,
  MeetingTranscriptionProcessor,
  ResumeParseProcessor,
  ResumeReviewGenerationProcessor,
  ResumeSemanticIndexProcessor,
} from "./background.processors.js";
import { BackgroundRecoveryService } from "./background.recovery.js";
import {
  InterviewNotificationSchedulerService,
  MailIngestSchedulerService,
} from "./background.schedulers.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type { BackgroundModuleAsyncOptions, BackgroundModuleOptions } from "./background.types.js";

function queueRegistration(name: string, prefix: () => string): DynamicModule {
  return BullModule.registerQueueAsync({
    name,
    useFactory: () => ({ prefix: prefix() }),
  });
}

const QUEUE_MODULES = [
  queueRegistration(RESUME_PARSE_QUEUE_NAME, buildResumeParseQueuePrefix),
  queueRegistration(RESUME_SEMANTIC_INDEX_QUEUE_NAME, buildResumeParseQueuePrefix),
  queueRegistration(RESUME_REVIEW_GENERATION_QUEUE_NAME, buildResumeParseQueuePrefix),
  queueRegistration(MAIL_INGEST_TRIGGER_QUEUE_NAME, buildResumeParseQueuePrefix),
  queueRegistration(MEETING_ANSWER_QUEUE_NAME, buildMeetingAnswerQueuePrefix),
  queueRegistration(MEETING_PLAYBACK_QUEUE_NAME, buildMeetingPlaybackQueuePrefix),
  queueRegistration(MEETING_PURGE_QUEUE_NAME, buildMeetingPurgeQueuePrefix),
  queueRegistration(MEETING_INTELLIGENCE_QUEUE_NAME, buildMeetingIntelligenceQueuePrefix),
  queueRegistration(MEETING_TRANSCRIPTION_QUEUE_NAME, buildMeetingTranscriptionQueuePrefix),
];

const QUEUE_NAMES = [
  RESUME_PARSE_QUEUE_NAME,
  RESUME_SEMANTIC_INDEX_QUEUE_NAME,
  RESUME_REVIEW_GENERATION_QUEUE_NAME,
  MAIL_INGEST_TRIGGER_QUEUE_NAME,
  MEETING_ANSWER_QUEUE_NAME,
  MEETING_PLAYBACK_QUEUE_NAME,
  MEETING_PURGE_QUEUE_NAME,
  MEETING_INTELLIGENCE_QUEUE_NAME,
  MEETING_TRANSCRIPTION_QUEUE_NAME,
] as const;

function disabledInfrastructureProviders(): Provider[] {
  const noopQueue = {
    close: () => Promise.resolve(),
    getJobCounts: (...types: string[]) =>
      Promise.resolve(Object.fromEntries(types.map((type) => [type, 0]))),
    waitUntilReady: () => Promise.resolve(),
  };
  return [
    {
      provide: BullRegistrar,
      useValue: { register: () => null },
    },
    ...QUEUE_NAMES.map((name) => ({ provide: getQueueToken(name), useValue: noopQueue })),
  ];
}

const BACKGROUND_PROVIDERS: Provider[] = [
  ResumeParseProcessor,
  ResumeSemanticIndexProcessor,
  ResumeReviewGenerationProcessor,
  MailIngestTriggerProcessor,
  MeetingAnswerProcessor,
  MeetingPlaybackProcessor,
  MeetingPurgeProcessor,
  MeetingIntelligenceProcessor,
  MeetingTranscriptionProcessor,
  BackgroundProcessorRegistry,
  BackgroundRecoveryService,
  MailIngestSchedulerService,
  InterviewNotificationSchedulerService,
  BackgroundDiagnosticsService,
  WorkerDiagnosticsGuard,
  BackgroundLifecycleService,
  { provide: BACKGROUND_LIFECYCLE, useExisting: BackgroundLifecycleService },
];

function infrastructureImports(): DynamicModule[] {
  return [
    BullModule.forRootAsync({
      extraOptions: { manualRegistration: true },
      useFactory: () => ({
        // Manual registration keeps HTTP-only replicas disconnected. A lazy
        // placeholder satisfies BullMQ's required connection shape when Redis
        // is intentionally absent; lifecycle validation fails before register
        // if workers are enabled without REDIS_URL.
        connection: getBackgroundRedisConnection() ?? {
          host: "127.0.0.1",
          lazyConnect: true,
          port: 6379,
        },
      }),
    }),
    ...QUEUE_MODULES,
  ];
}

@Global()
@Module({})
export class BackgroundModule {
  static register(options: BackgroundModuleOptions): DynamicModule {
    return this.build({ provide: BACKGROUND_WORKLOAD_ADAPTER, useValue: options.adapter });
  }

  static registerAsync(options: BackgroundModuleAsyncOptions): DynamicModule {
    return this.build(
      {
        inject: options.inject ?? [],
        provide: BACKGROUND_WORKLOAD_ADAPTER,
        useFactory: options.useFactory,
      },
      options.imports ?? [],
    );
  }

  private static build(
    adapterProvider: Provider,
    adapterImports: NonNullable<ModuleMetadata["imports"]> = [],
  ): DynamicModule {
    const workersEnabled = isBackgroundWorkersEnabled();
    return {
      controllers: [BackgroundDiagnosticsController],
      exports: [BACKGROUND_LIFECYCLE, BackgroundDiagnosticsService, MailIngestSchedulerService],
      imports: [...adapterImports, ...(workersEnabled ? infrastructureImports() : [])],
      module: BackgroundModule,
      providers: [
        adapterProvider,
        ...BACKGROUND_PROVIDERS,
        ...(workersEnabled ? [] : disabledInfrastructureProviders()),
      ],
    };
  }
}
