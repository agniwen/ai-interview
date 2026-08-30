import type {
  MeetingRecruitingContextSettings,
  MeetingRecruitingRecordSummary,
} from "@arc/shared/meeting-recording";
import { resolveRecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
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

export interface RecruitingContextServiceDependencies {
  listCandidates: typeof listMeetingRecruitingRecordCandidates;
  loadAuthorizedMeeting: (
    input: RecruitingContextAccessInput,
  ) => Promise<Parameters<typeof meetingRole>[0] | null>;
  loadContext: typeof loadMeetingRecruitingContext;
  loadRecordCandidate: typeof loadMeetingRecruitingRecordCandidate;
  meetingRole: typeof meetingRole;
  replaceContext: typeof replaceMeetingRecruitingContext;
  resolveVisibility: typeof resolveRecruitingVisibilityScope;
}

const defaultDependencies: RecruitingContextServiceDependencies = {
  listCandidates: listMeetingRecruitingRecordCandidates,
  loadAuthorizedMeeting,
  loadContext: loadMeetingRecruitingContext,
  loadRecordCandidate: loadMeetingRecruitingRecordCandidate,
  meetingRole,
  replaceContext: replaceMeetingRecruitingContext,
  resolveVisibility: resolveRecruitingVisibilityScope,
};

async function loadRecruitingVisibility(
  input: RecruitingContextAccessInput,
  dependencies: RecruitingContextServiceDependencies,
) {
  return await dependencies.resolveVisibility({
    currentRole: input.memberRole,
    organizationId: input.organizationId,
    userId: input.userId,
  });
}

export async function getMeetingRecruitingContext(
  input: RecruitingContextAccessInput,
  dependencies = defaultDependencies,
): Promise<MeetingRecruitingContextSettings | null> {
  const meeting = await dependencies.loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  const role = dependencies.meetingRole(meeting, input);
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
  const visibilityScope = await loadRecruitingVisibility(input, dependencies);
  const link = await dependencies.loadContext({
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    visibilityScope,
  });
  return { canManage: canManageMeetingLink, link };
}

export async function getMeetingRecruitingRecordCandidates(
  input: RecruitingContextAccessInput & { limit: number; search?: string },
  dependencies = defaultDependencies,
): Promise<"forbidden" | MeetingRecruitingRecordSummary[] | null> {
  const meeting = await dependencies.loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (
    !input.canReadRecruitingRecords ||
    !meetingAccessCapabilities(dependencies.meetingRole(meeting, input)).canManageRecruitingContext
  ) {
    return "forbidden";
  }
  return await dependencies.listCandidates({
    limit: input.limit,
    organizationId: input.organizationId,
    search: input.search,
    visibilityScope: await loadRecruitingVisibility(input, dependencies),
  });
}

export async function changeMeetingRecruitingContext(
  input: RecruitingContextAccessInput & { recruitingRecordId: string | null },
  dependencies = defaultDependencies,
): Promise<"forbidden" | "invalid-record" | "unchanged" | "updated" | null> {
  const meeting = await dependencies.loadAuthorizedMeeting(input);
  if (!meeting) {
    return null;
  }
  if (
    !meetingAccessCapabilities(dependencies.meetingRole(meeting, input)).canManageRecruitingContext
  ) {
    return "forbidden";
  }
  if (input.recruitingRecordId) {
    if (!input.canReadRecruitingRecords) {
      return "invalid-record";
    }
    const candidate = await dependencies.loadRecordCandidate({
      organizationId: input.organizationId,
      recruitingRecordId: input.recruitingRecordId,
      visibilityScope: await loadRecruitingVisibility(input, dependencies),
    });
    if (!candidate) {
      return "invalid-record";
    }
  }
  const result = await dependencies.replaceContext({
    actorId: input.userId,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    recruitingRecordId: input.recruitingRecordId,
  });
  return result === "not-found" ? null : result;
}
