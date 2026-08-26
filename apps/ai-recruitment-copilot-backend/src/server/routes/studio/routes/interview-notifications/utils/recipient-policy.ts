import type { InterviewNotificationAudienceType } from "@arc/db-schema/interview-notifications";

export function resolveInternalNotificationUserIds(input: {
  audienceType: Extract<
    InterviewNotificationAudienceType,
    "initiator_fallback" | "selected_hr_user"
  >;
  initiatorUserId: string | null;
  selectedUserIds: string[];
}): string[] {
  if (input.audienceType === "selected_hr_user") {
    return input.selectedUserIds;
  }
  return input.selectedUserIds.length === 0 && input.initiatorUserId ? [input.initiatorUserId] : [];
}
