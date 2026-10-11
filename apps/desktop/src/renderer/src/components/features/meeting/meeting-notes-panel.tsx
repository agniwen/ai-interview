import type { MeetingAccessRole } from "@app/shared/meeting-recording";

export function canCreateMeetingNotes(role: MeetingAccessRole): boolean {
  return role !== "viewer";
}
