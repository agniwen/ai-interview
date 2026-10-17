import { createHash } from "node:crypto";

export class ResumeUploadRequestConflictError extends Error {
  constructor() {
    super("上传请求已用于其他文件或批次，请重新选择文件后上传。");
    this.name = "ResumeUploadRequestConflictError";
  }
}

/** Existing primary keys provide durable, tenant-scoped retry receipts. */
export function resumeUploadRequestId(
  kind: "file" | "batch",
  organizationId: string,
  userId: string,
  requestId: string,
): string {
  return `upload-${kind}-${createHash("sha256")
    .update(JSON.stringify([organizationId, userId, requestId]))
    .digest("hex")}`;
}

export function assertSameUploadFile(
  existing: { contentHash: string | null; filename: string; size: number; storageKey: string },
  input: { contentHash?: string | null; filename: string; size: number; storageKey: string },
): void {
  if (
    existing.contentHash !== input.contentHash ||
    existing.filename !== input.filename ||
    existing.size !== input.size ||
    existing.storageKey !== input.storageKey
  ) {
    throw new ResumeUploadRequestConflictError();
  }
}
