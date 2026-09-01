/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- Minimal BullMQ queue test doubles intentionally implement only producer methods. */
import type { Queue } from "bullmq";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundQueueProducerService } from "./background-queue-producer.service.js";
import { BackgroundQueueModule } from "./background-queue.module.js";

interface QueueStub {
  add: ReturnType<typeof vi.fn>;
  addBulk: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
}

const originalEnabled = process.env.BACKGROUND_WORKERS_ENABLED;
const originalRedisUrl = process.env.REDIS_URL;

function queueStub(): QueueStub {
  return {
    add: vi.fn(() => Promise.resolve()),
    addBulk: vi.fn(async () => []),
    getJob: vi.fn(() => Promise.resolve()),
  };
}

type QueueStubs = readonly [
  QueueStub,
  QueueStub,
  QueueStub,
  QueueStub,
  QueueStub,
  QueueStub,
  QueueStub,
  QueueStub,
  QueueStub,
];

function bullQueue(queue: QueueStub): Queue {
  return queue as unknown as Queue;
}

function producer(queues: QueueStubs): BackgroundQueueProducerService {
  return new BackgroundQueueProducerService(
    bullQueue(queues[0]),
    bullQueue(queues[1]),
    bullQueue(queues[2]),
    bullQueue(queues[3]),
    bullQueue(queues[4]),
    bullQueue(queues[5]),
    bullQueue(queues[6]),
    bullQueue(queues[7]),
    bullQueue(queues[8]),
  );
}

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.BACKGROUND_WORKERS_ENABLED;
  } else {
    process.env.BACKGROUND_WORKERS_ENABLED = originalEnabled;
  }
  if (originalRedisUrl === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = originalRedisUrl;
  }
});

describe("BackgroundQueueProducerService", () => {
  it("resolves from a real Nest queue module on an HTTP-only replica", async () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/15";

    @Module({ imports: [BackgroundQueueModule.register()] })
    class ProducerApplicationModule {}

    const application = await NestFactory.createApplicationContext(ProducerApplicationModule, {
      logger: false,
    });
    expect(application.get(BackgroundQueueProducerService)).toBeInstanceOf(
      BackgroundQueueProducerService,
    );
    await application.close();
  });

  it("enqueues all nine workloads when consumers are disabled but Redis is configured", async () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    process.env.REDIS_URL = "redis://localhost:6379/0";
    const queues: QueueStubs = [
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
    ];
    const service = producer(queues);

    await service.enqueueResumeParseJobs([
      { batchId: "batch-1", itemId: "item:1", organizationId: "org-1", userId: "user-1" },
    ]);
    await service.enqueueResumeSemanticIndexJobs([
      { organizationId: "org-1", sourceId: "resume-1", sourceType: "studio_interview" },
    ]);
    await service.enqueueResumeReviewGenerationJobs([
      {
        jobDescriptionId: null,
        organizationId: "org-1",
        resumeRecordId: "resume-1",
        runId: "run-1",
        source: "resume_upload",
      },
    ]);
    await service.enqueueMailIngestTrigger({ organizationId: "org-1" });
    await service.enqueueMeetingAnswerJobs([{ exchangeId: "exchange:1" }]);
    await service.enqueueMeetingPlaybackJobs([{ meetingId: "meeting:1", organizationId: "org-1" }]);
    await service.enqueueMeetingPurgeJobs([{ meetingId: "meeting:1", organizationId: "org-1" }]);
    await service.enqueueMeetingIntelligenceJobs([{ processingRunId: "run:1" }]);
    await service.enqueueMeetingTranscriptionJobs([
      {
        meetingId: "meeting:1",
        model: "qwen",
        organizationId: "org-1",
        pipelineVersion: "final-v1",
        policyRevision: 1,
        provider: "qwen",
        region: "cn-beijing",
        sourceManifestSha256: "a".repeat(64),
      },
    ]);

    expect(queues.slice(0, 3).every((queue) => queue.addBulk.mock.calls.length === 1)).toBe(true);
    expect(queues[3]?.add).toHaveBeenCalledWith(
      "poll-mail-ingest-now",
      { organizationId: "org-1" },
      expect.objectContaining({ attempts: 3, backoff: { delay: 1000, type: "exponential" } }),
    );
    expect(queues[4]?.add).toHaveBeenCalledWith(
      "generate-meeting-answer",
      { exchangeId: "exchange:1" },
      expect.objectContaining({
        attempts: 5,
        backoff: { delay: 5000, type: "exponential" },
        jobId: "meeting-answer-exchange-1",
      }),
    );
    expect(queues[5]?.addBulk).toHaveBeenCalledOnce();
    expect(queues.slice(6).every((queue) => queue.add.mock.calls.length === 1)).toBe(true);
  });

  it("is a no-op only when Redis is absent", async () => {
    delete process.env.REDIS_URL;
    const queues: QueueStubs = [
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
      queueStub(),
    ];
    const service = producer(queues);

    await service.enqueueMeetingAnswerJobs([{ exchangeId: "exchange-1" }]);
    await service.enqueueResumeParseJobs([
      { batchId: "batch-1", itemId: "item-1", organizationId: "org-1", userId: "user-1" },
    ]);

    expect(queues.every((queue) => queue.add.mock.calls.length === 0)).toBe(true);
    expect(queues.every((queue) => queue.addBulk.mock.calls.length === 0)).toBe(true);
  });
});
