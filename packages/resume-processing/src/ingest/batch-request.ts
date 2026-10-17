import type { Database } from "@app/database";
import { recruitingUploadBatch, recruitingUploadBatchItem } from "@app/db-schema/schema";
import { asc, eq, sql } from "drizzle-orm";
import type { CreateBatchInput } from "./batches";
import { ResumeUploadRequestConflictError } from "./upload-request";
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
function matchesBatch(
  existing: typeof recruitingUploadBatch.$inferSelect,
  input: CreateBatchInput,
) {
  const target = input.target ?? "resume_library";
  const scope = target === "resume_pool" ? (input.resumePoolScope ?? "private") : null;
  return (
    existing.organizationId === input.organizationId &&
    existing.createdBy === input.userId &&
    existing.jdMode === input.jdMode &&
    existing.jobDescriptionId === input.jobDescriptionId &&
    existing.dedupPolicy === input.dedupPolicy &&
    existing.target === target &&
    existing.resumePoolScope === scope
  );
}
function matchesFiles(
  items: (typeof recruitingUploadBatchItem.$inferSelect)[],
  input: CreateBatchInput,
) {
  return (
    items.length === input.files.length &&
    items.every((item, index) => {
      const file = input.files[index];
      return (
        item.storageKey === file.storageKey &&
        item.contentHash === file.contentHash &&
        item.originalFileName === file.originalFileName &&
        item.fileSize === file.fileSize
      );
    })
  );
}
export async function replayUploadBatch(
  tx: Transaction,
  input: CreateBatchInput,
  batchId: string,
): Promise<boolean> {
  // Serialize same-operation retries; the existing primary key is the final uniqueness guard.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${batchId}, 0))`);
  const [existing] = await tx
    .select()
    .from(recruitingUploadBatch)
    .where(eq(recruitingUploadBatch.id, batchId));
  if (!existing) {
    return false;
  }
  const items = await tx
    .select()
    .from(recruitingUploadBatchItem)
    .where(eq(recruitingUploadBatchItem.batchId, batchId))
    .orderBy(asc(recruitingUploadBatchItem.orderIndex));
  if (!matchesBatch(existing, input) || !matchesFiles(items, input)) {
    throw new ResumeUploadRequestConflictError();
  }
  return true;
}
