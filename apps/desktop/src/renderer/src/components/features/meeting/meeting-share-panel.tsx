import type { MeetingAccessRole } from "@app/shared/meeting-recording";

export function canManageMeetingSharing(role: MeetingAccessRole): boolean {
  return role === "administrator" || role === "owner";
}
