import {
  enqueueMeetingPurgeJobs,
  isMeetingPurgeQueueConfigured,
} from "@app/meeting-processing-queue/meeting-purge";
import type {
  PaginatedTrashedMeetings,
  TrashedMeetingListQuery,
} from "@app/shared/meeting-recording";
import { toPaginatedResult } from "@app/shared/pagination";
import {
  listTrashedMeetingSessions,
  requestMeetingPurge,
  restoreMeetingSession,
  trashMeetingSession,
} from "./lifecycle-dao";

export interface MeetingLifecycleDependencies {
  enqueueMeetingPurgeJobs: typeof enqueueMeetingPurgeJobs;
  isMeetingPurgeQueueConfigured: typeof isMeetingPurgeQueueConfigured;
  listTrashedMeetingSessions: typeof listTrashedMeetingSessions;
  requestMeetingPurge: typeof requestMeetingPurge;
  restoreMeetingSession: typeof restoreMeetingSession;
  trashMeetingSession: typeof trashMeetingSession;
}

const defaultDependencies: MeetingLifecycleDependencies = {
  enqueueMeetingPurgeJobs,
  isMeetingPurgeQueueConfigured,
  listTrashedMeetingSessions,
  requestMeetingPurge,
  restoreMeetingSession,
  trashMeetingSession,
};

async function enqueueMeetingPurgeBestEffort(
  input: {
    meetingId: string;
    organizationId: string;
  },
  dependencies: MeetingLifecycleDependencies,
): Promise<void> {
  if (!dependencies.isMeetingPurgeQueueConfigured()) {
    return;
  }
  try {
    await dependencies.enqueueMeetingPurgeJobs([input]);
  } catch (error) {
    console.error("[meeting-purge] enqueue failed; reconciliation will retry", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      meetingId: input.meetingId,
    });
  }
}

export async function trashSavedMeeting(
  input: {
    actorId: string;
    meetingId: string;
    organizationId: string;
  },
  dependencies: MeetingLifecycleDependencies = defaultDependencies,
) {
  const result = await dependencies.trashMeetingSession(input);
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
  dependencies: MeetingLifecycleDependencies = defaultDependencies,
): Promise<PaginatedTrashedMeetings> {
  const result = await dependencies.listTrashedMeetingSessions(input);
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

export function restoreSavedMeeting(
  input: {
    actorId: string;
    meetingId: string;
    organizationId: string;
  },
  dependencies: MeetingLifecycleDependencies = defaultDependencies,
) {
  return dependencies.restoreMeetingSession(input);
}

export async function permanentlyPurgeSavedMeeting(
  input: {
    actorId: string;
    localRecoveryCleanup?: "deleted" | "failed" | "not-reported";
    meetingId: string;
    organizationId: string;
  },
  dependencies: MeetingLifecycleDependencies = defaultDependencies,
) {
  const result = await dependencies.requestMeetingPurge(input);
  if (result.state === "purging") {
    await enqueueMeetingPurgeBestEffort(
      {
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      },
      dependencies,
    );
  }
  return result;
}
