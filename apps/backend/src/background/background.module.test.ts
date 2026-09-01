import { BullRegistrar, getQueueToken } from "@nestjs/bullmq";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackgroundWorkloadAdapter } from "./background.types.js";

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
  it("does not import BullMQ infrastructure and supplies local queue seams", async () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    delete process.env.REDIS_URL;
    vi.resetModules();
    const [{ BackgroundModule }, { BackgroundQueueModule }] = await Promise.all([
      import("./background.module.js"),
      import("./background-queue.module.js"),
    ]);
    // SAFETY: workers are disabled, so lifecycle never calls the adapter in this module-shape test.
    const definition = BackgroundModule.register({ adapter: {} as BackgroundWorkloadAdapter });

    expect(definition.imports?.at(-1)).toBe(BackgroundQueueModule);
    // SAFETY: Nest's @Module decorator stores imports as an array in trusted framework metadata.
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      BackgroundQueueModule,
    ) as unknown[];
    // SAFETY: Nest's @Module decorator stores providers as an array in trusted framework metadata.
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      BackgroundQueueModule,
    ) as unknown[];
    expect(imports).toEqual([]);
    expect(providers).toContainEqual(expect.objectContaining({ provide: BullRegistrar }));
    expect(providers).toContainEqual(
      expect.objectContaining({ provide: getQueueToken(RESUME_PARSE_QUEUE_NAME) }),
    );
  });

  it("imports BullMQ producers for an HTTP-only replica with Redis configured", async () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    process.env.REDIS_URL = "redis://localhost:6379/0";
    vi.resetModules();
    const [{ BackgroundModule }, { BackgroundQueueModule }] = await Promise.all([
      import("./background.module.js"),
      import("./background-queue.module.js"),
    ]);
    // SAFETY: this module-shape test never invokes the deliberately minimal adapter.
    const definition = BackgroundModule.register({ adapter: {} as BackgroundWorkloadAdapter });

    expect(definition.imports?.at(-1)).toBe(BackgroundQueueModule);
    // SAFETY: Nest's @Module decorator stores imports as an array in trusted framework metadata.
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      BackgroundQueueModule,
    ) as unknown[];
    // SAFETY: Nest's @Module decorator stores providers as an array in trusted framework metadata.
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      BackgroundQueueModule,
    ) as unknown[];
    expect(imports.length).toBeGreaterThan(0);
    expect(providers).not.toContainEqual(expect.objectContaining({ provide: BullRegistrar }));
  });
});
