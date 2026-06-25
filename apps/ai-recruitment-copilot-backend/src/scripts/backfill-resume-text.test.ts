import { describe, expect, it, vi } from "vitest";
import {
  calculateRemainingResumeTextRecords,
  parseResumeTextBackfillConcurrency,
  parseResumeTextBackfillTarget,
  runResumeTextBackfillRecords,
  serializeResumeTextBackfillLog,
} from "./backfill-resume-text";

describe("resume text backfill helpers", () => {
  it("parses target scope with all as the default", () => {
    expect(parseResumeTextBackfillTarget()).toBe("all");
    expect(parseResumeTextBackfillTarget("studio")).toBe("studio");
    expect(parseResumeTextBackfillTarget("private")).toBe("studio");
    expect(parseResumeTextBackfillTarget("pool")).toBe("pool");
    expect(parseResumeTextBackfillTarget("public_pool")).toBe("public_pool");
    expect(parseResumeTextBackfillTarget("resume_pool_private")).toBe("private_pool");
    expect(() => parseResumeTextBackfillTarget("unknown")).toThrow("BACKFILL_RESUME_TEXT_TARGET");
  });

  it("uses six workers by default and validates concurrency overrides", () => {
    expect(parseResumeTextBackfillConcurrency()).toBe(6);
    expect(parseResumeTextBackfillConcurrency("2")).toBe(2);
    expect(() => parseResumeTextBackfillConcurrency("0")).toThrow(
      "BACKFILL_RESUME_TEXT_CONCURRENCY",
    );
  });

  it("backfills only records with existing parsed attachment text", async () => {
    const records = [
      {
        contentHash: "hash-1",
        id: "studio-1",
        recordType: "studio_interview" as const,
        storageKey: "resume/1.pdf",
      },
      {
        contentHash: "hash-2",
        id: "pool-1",
        recordType: "resume_pool_item" as const,
        storageKey: "resume/2.pdf",
      },
    ];
    const findParsedText = vi
      .fn()
      .mockResolvedValueOnce({ attachmentId: "att-1", text: "OCR text 1" })
      .mockResolvedValueOnce(null);
    const updateRecord = vi.fn().mockImplementation(async () => {});
    const logs: unknown[] = [];

    const summary = await runResumeTextBackfillRecords({
      concurrency: 1,
      dryRun: false,
      findParsedText,
      log: (entry) => logs.push(entry),
      records,
      updateRecord,
    });

    expect(summary).toEqual({ failed: 0, skipped: 1, succeeded: 1, total: 2 });
    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updateRecord).toHaveBeenCalledWith(records[0], "OCR text 1");
    expect(logs).toContainEqual(
      expect.objectContaining({
        attachmentId: "att-1",
        event: "record_succeeded",
        recordId: "studio-1",
      }),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: "record_skipped",
        reason: "no parsed attachment text",
        recordId: "pool-1",
      }),
    );
  });

  it("does not update records in dry run mode", async () => {
    const record = {
      contentHash: null,
      id: "studio-1",
      recordType: "studio_interview" as const,
      storageKey: "resume/1.pdf",
    };
    const updateRecord = vi.fn().mockImplementation(async () => {});

    const summary = await runResumeTextBackfillRecords({
      concurrency: 1,
      dryRun: true,
      findParsedText: vi.fn().mockResolvedValue({ attachmentId: "att-1", text: "OCR text 1" }),
      log: vi.fn(),
      records: [record],
      updateRecord,
    });

    expect(summary).toEqual({ failed: 0, skipped: 0, succeeded: 1, total: 1 });
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it("calculates remaining records after each completed item", () => {
    expect(calculateRemainingResumeTextRecords({ completed: 1, total: 3 })).toBe(2);
    expect(calculateRemainingResumeTextRecords({ completed: 4, total: 3 })).toBe(0);
  });

  it("serializes logs as single-line JSON", () => {
    const line = serializeResumeTextBackfillLog({
      event: "record_succeeded",
      recordId: "studio-1",
    });

    expect(line).toBe('{"event":"record_succeeded","recordId":"studio-1"}');
    expect(line).not.toContain("\n");
  });
});
