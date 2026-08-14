import type {
  MeetingAccessRole,
  MeetingGrantRole,
  MeetingVisibility,
} from "@arc/shared/meeting-recording";

export function isWorkspaceAdministrator(memberRole: string): boolean {
  return memberRole === "owner" || memberRole === "admin";
}

export function resolveMeetingAccessRole(input: {
  grantRole: MeetingGrantRole | null;
  isOwner: boolean;
  isWorkspaceAdministrator: boolean;
  visibility: MeetingVisibility;
}): MeetingAccessRole | null {
  if (input.isWorkspaceAdministrator) {
    return "administrator";
  }
  if (input.isOwner) {
    return "owner";
  }
  if (input.grantRole === "editor") {
    return "editor";
  }
  if (input.grantRole === "viewer" || input.visibility === "workspace") {
    return "viewer";
  }
  return null;
}

export function meetingAccessCapabilities(role: MeetingAccessRole) {
  const administrator = role === "administrator";
  const owner = role === "owner";
  const editor = role === "editor";
  return {
    canAskQuestions: true,
    canCorrectTranscript: administrator || owner || editor,
    canCreateNotes: administrator || owner || editor,
    canDeleteMeeting: administrator || owner,
    canEditMetadata: administrator || owner,
    canEditNotes: administrator || owner || editor,
    canExport: administrator || owner,
    canManageRecruitingContext: administrator || owner,
    canManageSharing: administrator || owner,
    canRead: true,
    canRegenerateIntelligence: administrator || owner,
    canRetryProcessing: administrator || owner,
  };
}
