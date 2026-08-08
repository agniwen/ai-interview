import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import { loadMeetingSessionForAccess } from "./dao";
import { isWorkspaceAdministrator, resolveMeetingAccessRole } from "./access";

export interface MeetingAccessInput {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}

export function loadAuthorizedMeeting(input: MeetingAccessInput) {
  return loadMeetingSessionForAccess({
    includeAllPrivateMeetings: isWorkspaceAdministrator(input.memberRole),
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    userId: input.userId,
  });
}

export function meetingRole(
  meeting: NonNullable<Awaited<ReturnType<typeof loadMeetingSessionForAccess>>>,
  input: Pick<MeetingAccessInput, "memberRole" | "userId">,
): MeetingAccessRole {
  return resolveMeetingAccessRole({
    grantRole: meeting.accessGrantRole,
    isOwner: (meeting.custodianId ?? meeting.ownerId) === input.userId,
    isWorkspaceAdministrator: isWorkspaceAdministrator(input.memberRole),
    visibility: meeting.visibility as "restricted" | "workspace",
  }) as MeetingAccessRole;
}
