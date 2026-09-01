import { BullRegistrar, getQueueToken } from "@nestjs/bullmq";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import { afterEach, describe, expect, it } from "vitest";
import type { BackgroundWorkloadAdapter } from "./background.types.js";
import { BackgroundModule } from "./background.module.js";

const originalEnabled = process.env.BACKGROUND_WORKERS_ENABLED;

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.BACKGROUND_WORKERS_ENABLED;
  } else {
    process.env.BACKGROUND_WORKERS_ENABLED = originalEnabled;
  }
});

describe("BackgroundModule HTTP-only replica", () => {
  it("does not import BullMQ infrastructure and supplies local queue seams", () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "false";
    // SAFETY: workers are disabled, so lifecycle never calls the adapter in this module-shape test.
    const definition = BackgroundModule.register({ adapter: {} as BackgroundWorkloadAdapter });

    expect(definition.imports).toEqual([]);
    const providers = definition.providers ?? [];
    expect(providers).toContainEqual(expect.objectContaining({ provide: BullRegistrar }));
    expect(providers).toContainEqual(
      expect.objectContaining({ provide: getQueueToken(RESUME_PARSE_QUEUE_NAME) }),
    );
  });

  it("imports BullMQ infrastructure only for an enabled worker replica", () => {
    process.env.BACKGROUND_WORKERS_ENABLED = "true";
    // SAFETY: this module-shape test never invokes the deliberately minimal adapter.
    const definition = BackgroundModule.register({ adapter: {} as BackgroundWorkloadAdapter });

    expect(definition.imports?.length).toBeGreaterThan(0);
    expect(definition.providers ?? []).not.toContainEqual(
      expect.objectContaining({ provide: BullRegistrar }),
    );
  });
});
