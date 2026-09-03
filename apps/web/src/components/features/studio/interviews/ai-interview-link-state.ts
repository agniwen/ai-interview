import type { ScheduleEntryStatus } from "@app/db-schema/studio-interviews";
import { formatDateInAppTimeZone, toDate } from "@app/shared/utils/time";

export interface AiInterviewLinkStateInput {
  candidateInviteExpiresAt: string | null;
  now?: Date;
  status: ScheduleEntryStatus;
}

export interface AiInterviewLinkState {
  copyDisabled: boolean;
  message: string;
}

export function resolveAiInterviewLinkState({
  candidateInviteExpiresAt,
  now = new Date(),
  status,
}: AiInterviewLinkStateInput): AiInterviewLinkState {
  const expiresAt = toDate(candidateInviteExpiresAt);
  if (!expiresAt) {
    return {
      copyDisabled: false,
      message: "面试链接永久有效",
    };
  }

  const formattedExpiry = formatDateInAppTimeZone(expiresAt, "YYYY年M月D日 HH:mm");
  const expiredBeforeStart = status === "pending" && expiresAt <= now;
  return expiredBeforeStart
    ? {
        copyDisabled: true,
        message: `面试链接已于 ${formattedExpiry} 过期，请重置沟通后重新复制。`,
      }
    : {
        copyDisabled: false,
        message: `面试链接有效至 ${formattedExpiry}`,
      };
}
