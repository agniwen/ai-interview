import { describe, expect, it, vi } from "vitest";
import {
  parseInterviewSnapshotBackfillDryRun,
  parseInterviewSnapshotBackfillTarget,
  runInterviewSnapshotBackfillRecords,
  serializeInterviewSnapshotBackfillLog,
} from "./backfill-interview-snapshots";

const records = [
  {
    createdBy: "user_1",
    interviewRecordId: "interview_1",
    recordType: "context_snapshot" as const,
    scheduleEntryId: "round_1",
  },
  {
    conversationId: "conversation_1",
    interviewRecordId: "interview_1",
    recordType: "evidence_snapshot" as const,
  },
];

describe("interview snapshot backfill helpers", () => {
  it("parses target scope with all as the default", () => {
    expect(parseInterviewSnapshotBackfillTarget()).toBe("all");
    expect(parseInterviewSnapshotBackfillTarget("context")).toBe("context");
    expect(parseInterviewSnapshotBackfillTarget("contexts")).toBe("context");
    expect(parseInterviewSnapshotBackfillTarget("evidence")).toBe("evidence");
    expect(parseInterviewSnapshotBackfillTarget("evidences")).toBe("evidence");
    expect(() => parseInterviewSnapshotBackfillTarget("unknown")).toThrow(
      "BACKFILL_INTERVIEW_SNAPSHOTS_TARGET",
    );
  });

  it("parses dry-run flags", () => {
    expect(parseInterviewSnapshotBackfillDryRun()).toBe(false);
    expect(parseInterviewSnapshotBackfillDryRun("true")).toBe(true);
    expect(parseInterviewSnapshotBackfillDryRun("1")).toBe(true);
    expect(parseInterviewSnapshotBackfillDryRun("yes")).toBe(true);
    expect(parseInterviewSnapshotBackfillDryRun("false")).toBe(false);
  });

  it("backfills context and evidence records through the matching callbacks", async () => {
    const backfillContext = vi.fn(async () => {});
    const backfillEvidence = vi.fn(async () => {});
    const log = vi.fn();

    const summary = await runInterviewSnapshotBackfillRecords({
      backfillContext,
      backfillEvidence,
      dryRun: false,
      log,
      records,
    });

    expect(summary).toEqual({ failed: 0, succeeded: 2, total: 2 });
    expect(backfillContext).toHaveBeenCalledWith(records[0]);
    expect(backfillEvidence).toHaveBeenCalledWith(records[1]);
    expect(
      log.mock.calls
        .map(([entry]) => entry)
        .filter((entry) => entry.event === "record_succeeded")
        .map((entry) => entry.remaining),
    ).toEqual([1, 0]);
  });

  it("does not write records in dry run mode", async () => {
    const backfillContext = vi.fn(async () => {});
    const backfillEvidence = vi.fn(async () => {});

    const summary = await runInterviewSnapshotBackfillRecords({
      backfillContext,
      backfillEvidence,
      dryRun: true,
      log: vi.fn(),
      records,
    });

    expect(summary).toEqual({ failed: 0, succeeded: 2, total: 2 });
    expect(backfillContext).not.toHaveBeenCalled();
    expect(backfillEvidence).not.toHaveBeenCalled();
  });

  it("continues after one record fails", async () => {
    const log = vi.fn();

    const summary = await runInterviewSnapshotBackfillRecords({
      backfillContext: vi.fn().mockRejectedValue(new Error("context failed")),
      backfillEvidence: vi.fn(async () => {}),
      dryRun: false,
      log,
      records,
    });

    expect(summary).toEqual({ failed: 1, succeeded: 1, total: 2 });
    expect(
      log.mock.calls
        .map(([entry]) => entry)
        .filter((entry) => entry.event === "record_failed")
        .map((entry) => [entry.recordType, entry.remaining]),
    ).toEqual([["context_snapshot", 1]]);
  });

  it("serializes logs as single-line JSON", () => {
    expect(
      serializeInterviewSnapshotBackfillLog({
        event: "record_succeeded",
        interviewRecordId: "interview_1",
      }),
    ).toBe('{"event":"record_succeeded","interviewRecordId":"interview_1"}');
  });
});
