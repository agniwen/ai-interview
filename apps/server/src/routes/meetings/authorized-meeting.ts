import type { MeetingAccessRole, MeetingGrantRole } from "@app/shared/meeting-recording";
import { loadMeetingSessionForAccess } from "./dao";
import { isWorkspaceAdministrator, resolveMeetingAccessRole } from "./access";
import { z } from "zod";

const meetingVisibilitySchema = z.enum(["restricted", "workspace"]);

export interface MeetingAccessInput {
  meetingId: string;
  memberRole: string;
  organizationId: string;
  userId: string;
}

interface MeetingRoleInput {
  accessGrantRole?: MeetingGrantRole | null;
  custodianId?: string | null;
  ownerId: string;
  visibility: string;
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
  meeting: MeetingRoleInput,
  input: Pick<MeetingAccessInput, "memberRole" | "userId">,
): MeetingAccessRole {
  const role = resolveMeetingAccessRole({
    grantRole: meeting.accessGrantRole ?? null,
    isOwner: (meeting.custodianId ?? meeting.ownerId) === input.userId,
    isWorkspaceAdministrator: isWorkspaceAdministrator(input.memberRole),
    visibility: meetingVisibilitySchema.parse(meeting.visibility),
  });
  if (!role) {
    throw new Error("Authorized meeting did not resolve to a readable access role");
  }
  return role;
}
