import type { UploadTaskInboxPage } from "@arc/shared/upload-task-inbox";
import { queryUploadTaskInbox } from "./dao";
import { normalizeQueueProgress, resolveInboxQueueState } from "./state";

function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function getQueueJobItemId(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const { itemId } = data as { itemId?: unknown };
  return typeof itemId === "string" ? itemId : null;
}

export async function listUploadTaskInbox(input: {
  cursor: string | null;
  organizationId: string;
  userId: string;
}): Promise<UploadTaskInboxPage> {
  const page = await queryUploadTaskInbox(input);
  const { getResumeParseQueueJobsByItemIds } = await import("@arc/resume-parse-queue/resume-parse");
  let queueJobs: Awaited<ReturnType<typeof getResumeParseQueueJobsByItemIds>> = [];
  try {
    queueJobs = await getResumeParseQueueJobsByItemIds(page.records.map((record) => record.id));
  } catch (error) {
    console.warn("[upload-task-inbox] failed to load live queue states", {
      error,
      organizationId: input.organizationId,
      userId: input.userId,
    });
  }
  const queueJobsById = new Map(
    queueJobs.flatMap((job) => {
      const itemId = getQueueJobItemId(job.data);
      return itemId ? [[itemId, job] as const] : [];
    }),
  );

  return {
    nextCursor: page.nextCursor,
    records: page.records.map((record) => {
      const queueJob = queueJobsById.get(record.id);
      return {
        attemptCount: record.attemptCount,
        batchId: record.batchId,
        candidateName: record.studioCandidateName ?? record.poolCandidateName,
        errorMessage: record.errorMessage ?? queueJob?.failedReason ?? null,
        fileSize: record.fileSize,
        finishedAt: toIsoString(record.finishedAt),
        id: record.id,
        originalFileName: record.originalFileName,
        progressPercent: normalizeQueueProgress(queueJob?.progress),
        queueState: resolveInboxQueueState(record.status, queueJob?.state ?? null),
        queuedAt: toIsoString(record.queuedAt),
        startedAt: toIsoString(record.startedAt),
        status: record.status,
        target: record.target,
        targetRole: record.studioTargetRole ?? record.poolTargetRole,
      };
    }),
    total: page.total,
  };
}
