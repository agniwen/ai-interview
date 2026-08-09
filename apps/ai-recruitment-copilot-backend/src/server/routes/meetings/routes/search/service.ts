import type {
  MeetingAccessRole,
  MeetingGrantRole,
  MeetingProcessingState,
} from "@arc/shared/meeting-recording";
import type { MeetingLibrarySearchResult } from "@arc/shared/meeting-search";
import { resolveMeetingAccessRole } from "../../access";
import { recordMeetingAudit } from "../../dao";
import { searchMeetingSessionsForAccess } from "./dao";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;

function processingState(status: string): MeetingProcessingState {
  if (status === "ready") {
    return "ready";
  }
  if (status === "processing-failed") {
    return "failed";
  }
  return "processing";
}

export async function searchSavedMeetings(input: {
  limit: number;
  organizationId: string;
  query: string;
  timeZone: string;
  userId: string;
}): Promise<MeetingLibrarySearchResult[]> {
  const result = await searchMeetingSessionsForAccess({
    limit: input.limit,
    organizationId: input.organizationId,
    query: input.query,
    timeZone: input.timeZone,
    userId: input.userId,
  });
  if (result.isAdministrator) {
    await recordMeetingAudit({
      action: "meeting.library_accessed",
      actorId: input.userId,
      dedupeWithinMs: ADMIN_ACCESS_AUDIT_DEDUPE_MS,
      organizationId: input.organizationId,
    });
  }
  return result.records.map((row) => ({
    accessRole: resolveMeetingAccessRole({
      grantRole: row.grantRole as MeetingGrantRole | null,
      isOwner: row.controllerId === input.userId,
      isWorkspaceAdministrator: result.isAdministrator,
      visibility: row.visibility as "restricted" | "workspace",
    }) as MeetingAccessRole,
    creator: {
      id: row.creatorId,
      image: row.creatorImage,
      name: row.creatorName,
    },
    durationMs: row.durationMs,
    id: row.id,
    match: row.match,
    processingState: processingState(row.status),
    recordingAvailable: row.recordingAvailable,
    savedAt: row.savedAt.toISOString(),
    title: row.title,
    workspaceCustodied: row.workspaceCustodied,
  }));
}
