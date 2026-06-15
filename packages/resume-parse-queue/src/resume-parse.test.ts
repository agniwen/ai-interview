import { describe, expect, it } from "vitest";
import {
  buildResumeParseJobId,
  buildResumeParseQueuePrefix,
  createRedisConnectionFromUrl,
  defaultResumeParseJobOptions,
  resumeParseJobSchema,
  shouldRemoveExistingResumeParseJob,
} from "./resume-parse";

describe("resume parse queue configuration", () => {
  it("parses password-only Redis URLs", () => {
    expect(createRedisConnectionFromUrl("redis://:abc%40123@localhost:6380/2")).toEqual({
      db: 2,
      host: "localhost",
      password: "abc@123",
      port: 6380,
      username: undefined,
    });
  });

  it("uses retry defaults when environment values are absent", () => {
    expect(defaultResumeParseJobOptions({})).toMatchObject({
      attempts: 3,
      backoff: {
        delay: 30_000,
        type: "exponential",
      },
    });
  });

  it("isolates queues by database URL by default", () => {
    const a = buildResumeParseQueuePrefix({
      DATABASE_URL: "postgresql://user:secret@db.example.com:5432/ainterview",
    });
    const b = buildResumeParseQueuePrefix({
      DATABASE_URL: "postgresql://user:secret@db.example.com:5432/other",
    });

    expect(a).toMatch(/^arc:resume-parse:[a-f0-9]{12}$/);
    expect(b).toMatch(/^arc:resume-parse:[a-f0-9]{12}$/);
    expect(a).not.toBe(b);
  });

  it("uses explicit queue prefix when configured", () => {
    expect(
      buildResumeParseQueuePrefix({
        DATABASE_URL: "postgresql://user:secret@db.example.com:5432/ainterview",
        RESUME_PARSE_QUEUE_PREFIX: "custom-prefix",
      }),
    ).toBe("custom-prefix");
  });

  it("validates queue payload shape", () => {
    expect(() =>
      resumeParseJobSchema.parse({
        batchId: "batch-1",
        itemId: "item-1",
        organizationId: "org-1",
        userId: "user-1",
      }),
    ).not.toThrow();
  });

  it("builds BullMQ-compatible custom job ids", () => {
    expect(buildResumeParseJobId("item:with:colon")).toBe("item-with-colon");
    expect(buildResumeParseJobId("item:with:colon")).not.toContain(":");
  });

  it("allows terminal retained jobs to be replaced on resume", () => {
    expect(shouldRemoveExistingResumeParseJob("completed")).toBe(true);
    expect(shouldRemoveExistingResumeParseJob("failed")).toBe(true);
    expect(shouldRemoveExistingResumeParseJob("waiting")).toBe(false);
    expect(shouldRemoveExistingResumeParseJob("active")).toBe(false);
    expect(shouldRemoveExistingResumeParseJob("delayed")).toBe(false);
  });
});
