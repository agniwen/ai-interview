import { describe, expect, it } from "vitest";
import { encodeUploadTaskInboxCursor } from "../routes/inbox/cursor";
import { uploadTaskInboxQuerySchema } from "../routes/inbox/schema";
import {
  normalizeQueueProgress,
  resolveInboxPreviewTarget,
  resolveInboxQueueState,
} from "../routes/inbox/state";

describe("upload task inbox queue state", () => {
  it("accepts only server-issued keyset cursors", () => {
    const cursor = encodeUploadTaskInboxCursor({
      batchCreatedAt: new Date("2026-07-30T00:00:00.000Z"),
      batchId: "batch-1",
      itemId: "item-20",
      orderIndex: 19,
    });
    expect(uploadTaskInboxQuerySchema.parse({})).toEqual({});
    expect(uploadTaskInboxQuerySchema.parse({ cursor })).toEqual({ cursor });
    expect(() => uploadTaskInboxQuerySchema.parse({ cursor: "invalid" })).toThrow();
  });

  it("prefers the live BullMQ state when the job still exists", () => {
    expect(resolveInboxQueueState("processing", "active")).toBe("active");
    expect(resolveInboxQueueState("pending", "delayed")).toBe("delayed");
  });

  it("never lets BullMQ completed overwrite a persisted business failure", () => {
    expect(resolveInboxQueueState("failed", "completed")).toBe("failed");
    expect(resolveInboxQueueState("cancelled", "completed")).toBe("cancelled");
  });

  it("falls back to the persisted upload state after BullMQ retention cleanup", () => {
    expect(resolveInboxQueueState("pending", null)).toBe("waiting");
    expect(resolveInboxQueueState("processing", null)).toBe("active");
    expect(resolveInboxQueueState("succeeded", null)).toBe("completed");
    expect(resolveInboxQueueState("duplicate_skipped", null)).toBe("duplicate-skipped");
    expect(resolveInboxQueueState("failed", null)).toBe("failed");
    expect(resolveInboxQueueState("cancelled", null)).toBe("cancelled");
  });

  it("normalizes BullMQ progress before exposing it through RPC", () => {
    expect(normalizeQueueProgress(42)).toBe(42);
    expect(normalizeQueueProgress({ percentage: 68 })).toBe(68);
    expect(normalizeQueueProgress({ progress: 0.25 })).toBe(25);
    expect(normalizeQueueProgress("unknown")).toBeNull();
  });

  it("does not expose archived or cancelled placeholder records for preview", () => {
    expect(
      resolveInboxPreviewTarget({
        poolItemId: "pool-1",
        poolItemStatus: "archived",
        resumeRecordId: null,
        target: "resume_pool",
      }),
    ).toBeNull();
    expect(
      resolveInboxPreviewTarget({
        poolItemId: "pool-2",
        poolItemStatus: "active",
        resumeRecordId: null,
        target: "resume_pool",
      }),
    ).toEqual({ id: "pool-2", resource: "resume-pool" });
  });
});
