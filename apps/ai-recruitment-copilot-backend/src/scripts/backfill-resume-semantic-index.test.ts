import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import {
  parseSemanticBackfillConcurrency,
  parseSemanticBackfillTarget,
  resolveSemanticBackfillPoolScope,
  runResumeSemanticBackfillRecords,
  serializeSemanticBackfillLog,
} from "./backfill-resume-semantic-index";

const records = Array.from({ length: 8 }, (_, index) => ({
  organizationId: "org-1",
  sourceId: `resume-${index + 1}`,
  sourceType: "studio_interview" as const,
}));

describe("resume semantic index backfill helpers", () => {
  it("uses six workers by default and validates concurrency overrides", () => {
    expect(parseSemanticBackfillConcurrency()).toBe(6);
    expect(parseSemanticBackfillConcurrency("3")).toBe(3);
    expect(() => parseSemanticBackfillConcurrency("0")).toThrow(
      "BACKFILL_RESUME_SEMANTIC_CONCURRENCY",
    );
  });

  it("parses target scope with all as the default", () => {
    expect(parseSemanticBackfillTarget()).toBe("all");
    expect(parseSemanticBackfillTarget("pool")).toBe("pool");
    expect(parseSemanticBackfillTarget("private")).toBe("studio");
    expect(parseSemanticBackfillTarget("studio_interview")).toBe("studio");
    expect(parseSemanticBackfillTarget("public")).toBe("public_pool");
    expect(parseSemanticBackfillTarget("plaza")).toBe("public_pool");
    expect(parseSemanticBackfillTarget("resume_plaza")).toBe("public_pool");
    expect(parseSemanticBackfillTarget("public_pool")).toBe("public_pool");
    expect(parseSemanticBackfillTarget("private_pool")).toBe("private_pool");
    expect(() => parseSemanticBackfillTarget("unknown")).toThrow("BACKFILL_RESUME_SEMANTIC_TARGET");
  });

  it("maps pool targets to the correct resume pool scope filter", () => {
    expect(resolveSemanticBackfillPoolScope("public_pool")).toBe("public");
    expect(resolveSemanticBackfillPoolScope("private_pool")).toBe("private");
    expect(resolveSemanticBackfillPoolScope("pool")).toBeNull();
    expect(resolveSemanticBackfillPoolScope("all")).toBeNull();
    expect(resolveSemanticBackfillPoolScope("studio")).toBeNull();
  });

  it("runs no more than the configured number of indexing tasks at once", async () => {
    let active = 0;
    let maxActive = 0;

    await runResumeSemanticBackfillRecords({
      concurrency: 6,
      indexRecord: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await sleep(1);
        active -= 1;
      },
      log: vi.fn(),
      records,
    });

    expect(maxActive).toBe(6);
  });

  it("logs the remaining count after each completed record", async () => {
    const log = vi.fn();

    const result = await runResumeSemanticBackfillRecords({
      concurrency: 2,
      indexRecord: () => Promise.resolve(),
      log,
      records: records.slice(0, 3),
    });

    expect(result).toEqual({ failed: 0, succeeded: 3, total: 3 });
    expect(
      log.mock.calls
        .map(([entry]) => entry)
        .filter((entry) => entry.event === "record_succeeded")
        .map((entry) => entry.remaining),
    ).toEqual([2, 1, 0]);
  });

  it("continues after one record fails", async () => {
    const log = vi.fn();

    const result = await runResumeSemanticBackfillRecords({
      concurrency: 2,
      indexRecord: (record) =>
        record.sourceId === "resume-2"
          ? Promise.reject(new Error("embedding failed"))
          : Promise.resolve(),
      log,
      records: records.slice(0, 3),
    });

    expect(result).toEqual({ failed: 1, succeeded: 2, total: 3 });
    expect(
      log.mock.calls
        .map(([entry]) => entry)
        .filter((entry) => entry.event === "record_failed")
        .map((entry) => [entry.sourceId, entry.remaining]),
    ).toEqual([["resume-2", 1]]);
  });

  it("serializes logs as single-line JSON", () => {
    expect(
      serializeSemanticBackfillLog({
        event: "record_succeeded",
        remaining: 1,
        sourceId: "resume-1",
      }),
    ).toBe('{"event":"record_succeeded","remaining":1,"sourceId":"resume-1"}');
  });
});
