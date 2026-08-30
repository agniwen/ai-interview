import type { UploadTaskInboxPage } from "@arc/shared/upload-task-inbox";
import { z } from "zod";
import { queryUploadTaskInbox } from "./dao";
import {
  normalizeQueueProgress,
  queueProgressSchema,
  resolveInboxPreviewTarget,
  resolveInboxQueueState,
} from "./state";

function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

const queueJobDataSchema = z.object({ itemId: z.string().optional() });

function getQueueJobItemId(data: z.output<typeof queueJobDataSchema>): string | null {
  return data.itemId ?? null;
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
      const parsedData = queueJobDataSchema.safeParse(job.data);
      const itemId = parsedData.success ? getQueueJobItemId(parsedData.data) : null;
      return itemId ? [[itemId, job] as const] : [];
    }),
  );

  return {
    nextCursor: page.nextCursor,
    records: page.records.map((record) => {
      const queueJob = queueJobsById.get(record.id);
      const queueProgress = queueJob ? queueProgressSchema.safeParse(queueJob.progress) : null;
      const previewTarget = resolveInboxPreviewTarget(record);

      return {
        attemptCount: record.attemptCount,
        batchId: record.batchId,
        candidateName: record.studioCandidateName ?? record.poolCandidateName,
        errorMessage: record.errorMessage ?? queueJob?.failedReason ?? null,
        fileSize: record.fileSize,
        finishedAt: toIsoString(record.finishedAt),
        id: record.id,
        originalFileName: record.originalFileName,
        previewTarget,
        progressPercent: queueProgress?.success ? normalizeQueueProgress(queueProgress.data) : null,
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
