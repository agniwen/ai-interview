import {
  enqueueMeetingPurgeJobs,
  isMeetingPurgeQueueConfigured,
} from "@arc/meeting-processing-queue/meeting-purge";
import type {
  PaginatedTrashedMeetings,
  TrashedMeetingListQuery,
} from "@arc/shared/meeting-recording";
import { toPaginatedResult } from "@arc/shared/pagination";
import {
  listTrashedMeetingSessions,
  requestMeetingPurge,
  restoreMeetingSession,
  trashMeetingSession,
} from "./lifecycle-dao";

async function enqueueMeetingPurgeBestEffort(input: {
  meetingId: string;
  organizationId: string;
}): Promise<void> {
  if (!isMeetingPurgeQueueConfigured()) {
    return;
  }
  try {
    await enqueueMeetingPurgeJobs([input]);
  } catch (error) {
    console.error("[meeting-purge] enqueue failed; reconciliation will retry", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      meetingId: input.meetingId,
    });
  }
}

export async function trashSavedMeeting(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
}) {
  const result = await trashMeetingSession(input);
  if (result.state === "trashed" || result.state === "already-trashed") {
    return { purgeAfter: result.purgeAfter.toISOString(), state: result.state };
  }
  return result;
}

export async function listTrashedSavedMeetings(
  input: {
    actorId: string;
    organizationId: string;
  } & TrashedMeetingListQuery,
): Promise<PaginatedTrashedMeetings> {
  const result = await listTrashedMeetingSessions(input);
  const records = result.records.flatMap((record) =>
    record.purgeAfter && record.trashedAt
      ? [
          {
            creator: {
              id: record.creatorId,
              image: record.creatorImage,
              name: record.creatorName,
            },
            id: record.id,
            purgeAfter: record.purgeAfter.toISOString(),
            savedAt: record.savedAt.toISOString(),
            title: record.title,
            trashedAt: record.trashedAt.toISOString(),
          },
        ]
      : [],
  );
  return toPaginatedResult(records, result.total, input.page, input.pageSize);
}

export function restoreSavedMeeting(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
}) {
  return restoreMeetingSession(input);
}

export async function permanentlyPurgeSavedMeeting(input: {
  actorId: string;
  localRecoveryCleanup?: "deleted" | "failed" | "not-reported";
  meetingId: string;
  organizationId: string;
}) {
  const result = await requestMeetingPurge(input);
  if (result.state === "purging") {
    await enqueueMeetingPurgeBestEffort({
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  return result;
}
