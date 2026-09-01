import { BullRegistrar, getQueueToken } from "@nestjs/bullmq";
import type { DynamicModule } from "@nestjs/common";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import { afterEach, describe, expect, it } from "vitest";
import type { BackgroundWorkloadAdapter } from "./background.types.js";
import { BackgroundModule } from "./background.module.js";

const originalEnabled = process.env.BACKGROUND_WORKERS_ENABLED;
const originalRedisUrl = process.env.REDIS_URL;

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

describe("BackgroundModule HTTP-only replica", () => {
  it("does not import BullMQ infrastructure and supplies local queue seams", () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    delete process.env.REDIS_URL;
    // SAFETY: workers are disabled, so lifecycle never calls the adapter in this module-shape test.
    const definition = BackgroundModule.register({ adapter: {} as BackgroundWorkloadAdapter });

    // SAFETY: BackgroundModule always appends its dynamic queue module as the final import.
    const queueModule = definition.imports?.at(-1) as DynamicModule;
    expect(queueModule.imports).toEqual([]);
    const providers = queueModule.providers ?? [];
    expect(providers).toContainEqual(expect.objectContaining({ provide: BullRegistrar }));
    expect(providers).toContainEqual(
      expect.objectContaining({ provide: getQueueToken(RESUME_PARSE_QUEUE_NAME) }),
    );
  });

  it("imports BullMQ producers for an HTTP-only replica with Redis configured", () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    process.env.REDIS_URL = "redis://localhost:6379/0";
    // SAFETY: this module-shape test never invokes the deliberately minimal adapter.
    const definition = BackgroundModule.register({ adapter: {} as BackgroundWorkloadAdapter });

    // SAFETY: BackgroundModule always appends its dynamic queue module as the final import.
    const queueModule = definition.imports?.at(-1) as DynamicModule;
    expect(queueModule.imports?.length).toBeGreaterThan(0);
    expect(queueModule.providers ?? []).not.toContainEqual(
      expect.objectContaining({ provide: BullRegistrar }),
    );
  });
});
