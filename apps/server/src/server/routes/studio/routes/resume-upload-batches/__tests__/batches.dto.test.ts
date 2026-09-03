import { describe, expect, it } from "vitest";
import { toItemDto } from "../dao/batches";

describe("resume upload batch DTO mapping", () => {
  it("preserves duplicate match snapshots for skipped items", () => {
    const snapshot = [
      {
        candidateEmail: "candidate@example.com",
        candidateName: "候选人",
        id: "existing-resume",
      },
    ];

    const item = toItemDto({
      attemptCount: 0,
      batchId: "batch",
      contentHash: "hash",
      dedupMatchSnapshot: snapshot,
      errorMessage: null,
      fileSize: 1234,
      finishedAt: new Date("2026-06-21T00:01:00.000Z"),
      id: "item",
      orderIndex: 0,
      organizationId: "org",
      originalFileName: "resume.pdf",
      poolItemId: null,
      queueJobId: null,
      queuedAt: null,
      resumeRecordId: null,
      startedAt: new Date("2026-06-21T00:00:00.000Z"),
      status: "duplicate_skipped",
      storageKey: "attachments/resume.pdf",
    });

    expect(item.dedupMatchSnapshot).toEqual(snapshot);
  });
});
