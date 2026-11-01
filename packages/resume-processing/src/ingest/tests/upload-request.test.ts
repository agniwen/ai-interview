import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recruitingUploadBatch,
  recruitingUploadBatchItem,
  chatAttachment,
} from "@app/db-schema/schema";
import { insertBatchWithItems as unboundInsertBatch } from "../batches";
import { createAttachment as unboundCreateAttachment } from "../../internal/attachments/dao";
import {
  assertSameUploadFile,
  resumeUploadRequestId,
  ResumeUploadRequestConflictError,
} from "../upload-request";

import { bindResumeProcessingDatabase } from "../../database";
import type { Database } from "@app/database";
import type { PgTable } from "drizzle-orm/pg-core";

const mocks = {
  execute: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
};
// SAFETY: This injected executor implements only the queries exercised by receipt replay.
// Unexpected queries throw; no application database or network connection is configured.
const database = Object.create(null) as Database;
Object.assign(database, mocks);
const insertBatchWithItems = bindResumeProcessingDatabase(database, unboundInsertBatch);
const createAttachment = bindResumeProcessingDatabase(database, unboundCreateAttachment);
const file = {
  contentHash: "hash",
  fileSize: 12,
  originalFileName: "resume.pdf",
  storageKey: "files/hash.pdf",
};
const input = {
  dedupPolicy: "create",
  files: [file],
  jdMode: "none",
  jobDescriptionId: null,
  organizationId: "org",
  requestId: "operation",
  resumePoolScope: "private",
  target: "resume_pool",
  userId: "user",
} as const;
const receipt = {
  createdBy: "user",
  dedupPolicy: "create",
  id: resumeUploadRequestId("batch", "org", "user", "operation"),
  jdMode: "none",
  jobDescriptionId: null,
  organizationId: "org",
  resumePoolScope: "private",
  target: "resume_pool",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation((fn) => fn(mocks));
  mocks.execute.mockImplementation(() => Promise.resolve());
});
function existingBatch(files = [file]) {
  mocks.select.mockReturnValue({
    from: (table: PgTable) => {
      if (table === recruitingUploadBatch) {
        return { where: () => Promise.resolve([receipt]) };
      }
      if (table === recruitingUploadBatchItem) {
        return { where: () => ({ orderBy: () => Promise.resolve(files) }) };
      }
      throw new Error("Unexpected table");
    },
  });
}

describe("upload request replay", () => {
  it("returns an existing batch without creating new candidates or items", async () => {
    existingBatch();
    await expect(insertBatchWithItems({ ...input, files: [file] })).resolves.toBe(receipt.id);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects reuse of a batch identity for different file content", async () => {
    existingBatch();
    await expect(
      insertBatchWithItems({ ...input, files: [{ ...file, contentHash: "changed" }] }),
    ).rejects.toBeInstanceOf(ResumeUploadRequestConflictError);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects reuse of a batch identity for a different destination", async () => {
    existingBatch();
    await expect(
      insertBatchWithItems({ ...input, files: [file], target: "resume_library" }),
    ).rejects.toBeInstanceOf(ResumeUploadRequestConflictError);
  });
  it("isolates operation identities by actor, workspace, and operation kind", () => {
    const ids = [
      resumeUploadRequestId("file", "org", "a", "id"),
      resumeUploadRequestId("file", "org", "b", "id"),
      resumeUploadRequestId("file", "other", "a", "id"),
      resumeUploadRequestId("batch", "org", "a", "id"),
    ];
    expect(new Set(ids).size).toBe(4);
    expect(resumeUploadRequestId("file", "org", "a", "id")).toBe(ids[0]);
  });
  it("uses the attachment primary key to recover a concurrent insert", async () => {
    const attachment = {
      contentHash: "hash",
      filename: "resume.pdf",
      id: "receipt",
      idempotent: true,
      mediaType: "application/pdf",
      organizationId: "org",
      size: 12,
      storageKey: "files/hash.pdf",
      userId: "user",
    };
    const onConflictDoNothing = vi.fn(() => Promise.resolve());
    mocks.insert.mockReturnValue({ values: () => ({ onConflictDoNothing }) });
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([attachment]) }) }),
    });
    await createAttachment(attachment);
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: chatAttachment.id });
  });
  it("does not accept a changed file under a completed upload identity", () => {
    const original = {
      contentHash: "hash",
      filename: "resume.pdf",
      size: 12,
      storageKey: "files/hash.pdf",
    };
    expect(() => assertSameUploadFile(original, { ...original, contentHash: "other" })).toThrow(
      ResumeUploadRequestConflictError,
    );
  });
});
