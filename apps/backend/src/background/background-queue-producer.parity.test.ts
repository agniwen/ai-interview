/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- Test doubles intentionally expose only the producer methods used by the shared queue helpers. */
import { getQueueToken } from "@nestjs/bullmq";
import { Test } from "@nestjs/testing";
import {
  MEETING_ANSWER_QUEUE_NAME,
  reconcileMeetingAnswerJob,
} from "@arc/meeting-processing-queue/meeting-answer";
import {
  MEETING_INTELLIGENCE_QUEUE_NAME,
  reconcileMeetingIntelligenceJob,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import { MEETING_PLAYBACK_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-playback";
import {
  MEETING_PURGE_QUEUE_NAME,
  reconcileMeetingPurgeJob,
} from "@arc/meeting-processing-queue/meeting-purge";
import {
  MEETING_TRANSCRIPTION_QUEUE_NAME,
  reconcileMeetingTranscriptionJob,
} from "@arc/meeting-processing-queue/meeting-transcription";
import { MAIL_INGEST_TRIGGER_QUEUE_NAME } from "@arc/resume-parse-queue/mail-ingest-trigger";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import { RESUME_REVIEW_GENERATION_QUEUE_NAME } from "@arc/resume-parse-queue/resume-review-generation";
import { RESUME_SEMANTIC_INDEX_QUEUE_NAME } from "@arc/resume-parse-queue/resume-semantic-index";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueMailIngestTriggerWithQueue,
  enqueueMeetingPlaybackJobsWithQueue,
  enqueueResumeParseJobsWithQueue,
  enqueueResumeReviewGenerationJobsWithQueue,
  enqueueResumeSemanticIndexJobsWithQueue,
} from "./background-queue-producer.helpers.js";
import { BackgroundQueueProducerService } from "./background-queue-producer.service.js";
import { runWithRequestCorrelation } from "../observability/request-correlation.context.js";

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

const jobs = {
  answer: { exchangeId: "exchange:1" },
  intelligence: { processingRunId: "run:1" },
  mail: { organizationId: "org-1" },
  parse: { batchId: "batch-1", itemId: "item:1", organizationId: "org-1", userId: "user-1" },
  playback: { meetingId: "meeting:1", organizationId: "org-1" },
  purge: { meetingId: "meeting:1", organizationId: "org-1" },
  review: {
    jobDescriptionId: null,
    organizationId: "org-1",
    resumeRecordId: "resume-1",
    runId: "run-1",
    source: "resume_upload" as const,
  },
  semantic: {
    organizationId: "org-1",
    sourceId: "resume-1",
    sourceType: "studio_interview" as const,
  },
  transcription: {
    meetingId: "meeting:1",
    model: "qwen",
    organizationId: "org-1",
    pipelineVersion: "final-v1" as const,
    policyRevision: 1,
    provider: "qwen" as const,
    region: "cn-beijing",
    sourceManifestSha256: "a".repeat(64),
  },
};

interface ExistingJobStub {
  getState: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

interface QueueStub {
  add: ReturnType<typeof vi.fn>;
  addBulk: ReturnType<typeof vi.fn>;
  existingJob?: ExistingJobStub;
  getJob: ReturnType<typeof vi.fn>;
  name: string;
}

function queueStub(name: string, existingState?: string): QueueStub {
  const existingJob = existingState
    ? { getState: vi.fn(async () => existingState), remove: vi.fn(async () => {}) }
    : undefined;
  return {
    add: vi.fn(async () => {}),
    addBulk: vi.fn(async () => []),
    existingJob,
    getJob: vi.fn(async () => existingJob),
    name,
  };
}

function queueSet(existingState?: string): QueueStub[] {
  return QUEUE_NAMES.map((name) => queueStub(name, existingState));
}

async function exerciseNest(queues: QueueStub[]): Promise<void> {
  const testingModule = await Test.createTestingModule({
    providers: [
      BackgroundQueueProducerService,
      ...QUEUE_NAMES.map((name, index) => ({
        provide: getQueueToken(name),
        useValue: queues[index],
      })),
    ],
  }).compile();
  const producer = testingModule.get(BackgroundQueueProducerService);
  try {
    await producer.enqueueResumeParseJobs([jobs.parse]);
    await producer.enqueueResumeSemanticIndexJobs([jobs.semantic]);
    await producer.enqueueResumeReviewGenerationJobs([jobs.review]);
    await producer.enqueueMailIngestTrigger(jobs.mail);
    await producer.enqueueMeetingAnswerJobs([jobs.answer]);
    await producer.enqueueMeetingPlaybackJobs([jobs.playback]);
    await producer.enqueueMeetingPurgeJobs([jobs.purge]);
    await producer.enqueueMeetingIntelligenceJobs([jobs.intelligence]);
    await producer.enqueueMeetingTranscriptionJobs([jobs.transcription]);
  } finally {
    await testingModule.close();
  }
}

async function exerciseLegacyHelpers(queues: QueueStub[]): Promise<void> {
  await enqueueResumeParseJobsWithQueue(queues[0] as never, [jobs.parse]);
  await enqueueResumeSemanticIndexJobsWithQueue(queues[1] as never, [jobs.semantic]);
  await enqueueResumeReviewGenerationJobsWithQueue(queues[2] as never, [jobs.review]);
  await enqueueMailIngestTriggerWithQueue(queues[3] as never, jobs.mail);
  await reconcileMeetingAnswerJob(queues[4] as never, jobs.answer);
  await enqueueMeetingPlaybackJobsWithQueue(queues[5] as never, [jobs.playback]);
  await reconcileMeetingPurgeJob(queues[6] as never, jobs.purge);
  await reconcileMeetingIntelligenceJob(queues[7] as never, jobs.intelligence);
  await reconcileMeetingTranscriptionJob(queues[8] as never, jobs.transcription);
}

function trace(queues: QueueStub[]) {
  return queues.map((queue) => ({
    add: queue.add.mock.calls,
    addBulk: queue.addBulk.mock.calls,
    getJob: queue.getJob.mock.calls,
    getStateCalls: queue.existingJob?.getState.mock.calls ?? [],
    name: queue.name,
    removeCalls: queue.existingJob?.remove.mock.calls ?? [],
  }));
}

function enqueuedEntries(queues: QueueStub[]) {
  return queues.flatMap((queue) => [
    ...queue.add.mock.calls.map((call) => ({ data: call[1], options: call[2] })),
    ...queue.addBulk.mock.calls.flatMap((call) =>
      call[0].map((entry: { data: unknown; opts: unknown }) => ({
        data: entry.data,
        options: entry.opts,
      })),
    ),
  ]);
}

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalRedisUrl === undefined) {
    Reflect.deleteProperty(process.env, "REDIS_URL");
  } else {
    process.env.REDIS_URL = originalRedisUrl;
  }
});

describe("Nest producer parity with the legacy shared queue helpers", () => {
  it("preserves all nine queue names, payloads, job IDs, and retry options", async () => {
    process.env.REDIS_URL = "redis://localhost:6379/15";
    const nestQueues = queueSet();
    const legacyQueues = queueSet();

    await exerciseNest(nestQueues);
    await exerciseLegacyHelpers(legacyQueues);

    expect(nestQueues.map((queue) => queue.name)).toEqual(QUEUE_NAMES);
    expect(trace(nestQueues)).toEqual(trace(legacyQueues));
  });

  it("preserves existing-job deduplication semantics for every queue helper", async () => {
    process.env.REDIS_URL = "redis://localhost:6379/15";
    const nestQueues = queueSet("active");
    const legacyQueues = queueSet("active");

    await exerciseNest(nestQueues);
    await exerciseLegacyHelpers(legacyQueues);

    expect(trace(nestQueues)).toEqual(trace(legacyQueues));
  });

  it("propagates request correlation through options for all nine schemas", async () => {
    process.env.REDIS_URL = "redis://localhost:6379/15";
    const queues = queueSet();

    await runWithRequestCorrelation("request-all-queues", () => exerciseNest(queues));

    const entries = enqueuedEntries(queues);
    expect(entries).toHaveLength(9);
    expect(
      entries.every(
        (entry) =>
          entry.options.telemetry?.metadata ===
          JSON.stringify({ correlationId: "request-all-queues" }),
      ),
    ).toBe(true);
    expect(entries.every((entry) => !("correlationId" in entry.data))).toBe(true);
  });
});
