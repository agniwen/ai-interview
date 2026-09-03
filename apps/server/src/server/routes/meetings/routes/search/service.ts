import type { MeetingProcessingState } from "@app/shared/meeting-recording";
import type { MeetingLibrarySearchResult } from "@app/shared/meeting-search";
import { z } from "zod";
import { resolveMeetingAccessRole } from "../../access";
import { recordMeetingAudit } from "../../dao";
import { searchMeetingSessionsForAccess } from "./dao";

const ADMIN_ACCESS_AUDIT_DEDUPE_MS = 5 * 60 * 1000;
const meetingGrantRoleSchema = z.enum(["editor", "viewer"]).nullable();
const meetingVisibilitySchema = z.enum(["restricted", "workspace"]);

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
  return result.records.flatMap((row) => {
    const grantRole = meetingGrantRoleSchema.safeParse(row.grantRole);
    const visibility = meetingVisibilitySchema.safeParse(row.visibility);
    if (!grantRole.success || !visibility.success) {
      return [];
    }
    const accessRole = resolveMeetingAccessRole({
      grantRole: grantRole.data,
      isOwner: row.controllerId === input.userId,
      isWorkspaceAdministrator: result.isAdministrator,
      visibility: visibility.data,
    });
    if (!accessRole) {
      return [];
    }
    return [
      {
        accessRole,
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
      },
    ];
  });
}
