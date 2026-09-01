/* oxlint-disable typescript/no-extraneous-class -- Nest modules are declarative classes discovered through decorator metadata. */
import { Module } from "@nestjs/common";
import type { DynamicModule, Provider } from "@nestjs/common";
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
import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import { getBackgroundRedisConnection } from "./background.config.js";
import { BackgroundQueueProducerService } from "./background-queue-producer.service.js";

function queueRegistration(name: string, prefix: () => string): DynamicModule {
  return BullModule.registerQueueAsync({ name, useFactory: () => ({ prefix: prefix() }) });
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
    { provide: BullRegistrar, useValue: { register: () => null } },
    ...QUEUE_NAMES.map((name) => ({ provide: getQueueToken(name), useValue: noopQueue })),
  ];
}

function infrastructureImports(): DynamicModule[] {
  return [
    BullModule.forRootAsync({
      extraOptions: { manualRegistration: true },
      useFactory: () => ({
        connection: getBackgroundRedisConnection(rawBackendEnvironment) ?? {
          host: "127.0.0.1",
          lazyConnect: true,
          port: 6379,
        },
      }),
    }),
    ...QUEUE_MODULES,
  ];
}

const REDIS_CONFIGURED = getBackgroundRedisConnection(rawBackendEnvironment) !== undefined;
const QUEUE_INFRASTRUCTURE = REDIS_CONFIGURED ? infrastructureImports() : [];
const DISABLED_INFRASTRUCTURE = REDIS_CONFIGURED ? [] : disabledInfrastructureProviders();

@Module({
  exports: [
    BackgroundQueueProducerService,
    ...(REDIS_CONFIGURED
      ? QUEUE_INFRASTRUCTURE
      : [BullRegistrar, ...QUEUE_NAMES.map(getQueueToken)]),
  ],
  imports: QUEUE_INFRASTRUCTURE,
  providers: [BackgroundQueueProducerService, ...DISABLED_INFRASTRUCTURE],
})
export class BackgroundQueueModule {}
