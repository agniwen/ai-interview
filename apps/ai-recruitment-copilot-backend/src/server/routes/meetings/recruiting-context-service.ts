import type {
  MeetingRecruitingContextSettings,
  MeetingRecruitingRecordSummary,
} from "@arc/shared/meeting-recording";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { meetingAccessCapabilities } from "./access";
import { loadAuthorizedMeeting, meetingRole } from "./authorized-meeting";
import { recordMeetingAudit } from "./dao";
import {
  listMeetingRecruitingRecordCandidates,
  loadMeetingRecruitingContext,
  loadMeetingRecruitingRecordCandidate,
  replaceMeetingRecruitingContext,
} from "./recruiting-context-dao";

interface RecruitingContextAccessInput {
  canReadRecruitingRecords: boolean;
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}

async function loadRecruitingVisibility(input: RecruitingContextAccessInput) {
  return await resolveRecruitingVisibilityScope({
    currentRole: input.memberRole,
    organizationId: input.organizationId,
    userId: input.userId,
  });
}

export async function getMeetingRecruitingContext(
  input: RecruitingContextAccessInput,
): Promise<MeetingRecruitingContextSettings | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = meetingRole(meeting, input);
  const canManageMeetingLink = meetingAccessCapabilities(role).canManageRecruitingContext;
  if (role === "administrator") {
    await recordMeetingAudit({
      action: "meeting.recruiting_context_accessed",
      actorId: input.userId,
      dedupeWithinMs: 5 * 60 * 1000,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
  if (!input.canReadRecruitingRecords) {
    return { canManage: false, link: null };
  }
  const visibilityScope = await loadRecruitingVisibility(input);
  const link = await loadMeetingRecruitingContext({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    visibilityScope,
  });
  return { canManage: canManageMeetingLink, link };
}

export async function getMeetingRecruitingRecordCandidates(
  input: RecruitingContextAccessInput & { limit: number; search?: string },
): Promise<"forbidden" | MeetingRecruitingRecordSummary[] | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (
    !input.canReadRecruitingRecords ||
    !meetingAccessCapabilities(meetingRole(meeting, input)).canManageRecruitingContext
  ) {
    return "forbidden";
  }
  return await listMeetingRecruitingRecordCandidates({
    limit: input.limit,
    organizationId: input.organizationId,
    search: input.search,
    visibilityScope: await loadRecruitingVisibility(input),
  });
}

export async function changeMeetingRecruitingContext(
  input: RecruitingContextAccessInput & { recruitingRecordId: string | null },
): Promise<"forbidden" | "invalid-record" | "unchanged" | "updated" | null> {
  const meeting = await loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (!meetingAccessCapabilities(meetingRole(meeting, input)).canManageRecruitingContext) {
    return "forbidden";
  }
  if (input.recruitingRecordId) {
    if (!input.canReadRecruitingRecords) {
      return "invalid-record";
    }
    const candidate = await loadMeetingRecruitingRecordCandidate({
      organizationId: input.organizationId,
      recruitingRecordId: input.recruitingRecordId,
      visibilityScope: await loadRecruitingVisibility(input),
    });
    if (!candidate) {
      return "invalid-record";
    }
  }
  const result = await replaceMeetingRecruitingContext({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    recruitingRecordId: input.recruitingRecordId,
  });
  return result === "not-found" ? null : result;
}
