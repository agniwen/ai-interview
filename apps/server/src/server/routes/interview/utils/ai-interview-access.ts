import type { CandidateInterviewInvitationStatus } from "@arc/db-schema/interview-notifications";
import type { ScheduleEntryStatus } from "@arc/db-schema/studio-interviews";

export type AiInterviewAccessDecision = "allowed" | "auto_accept" | "unavailable";

export function resolveAiInterviewAccess(input: {
  candidateInviteExpiresAt: Date | null;
  candidateInviteStatus: CandidateInterviewInvitationStatus;
  candidateInviteTokenHash: string | null;
  now?: Date;
  roundStatus: ScheduleEntryStatus;
}): AiInterviewAccessDecision {
  if (!input.candidateInviteTokenHash) {
    return "allowed";
  }
  if (input.candidateInviteStatus === "declined" || input.candidateInviteStatus === "expired") {
    return "unavailable";
  }
  if (input.roundStatus !== "pending") {
    return "allowed";
  }
  if (
    !input.candidateInviteExpiresAt ||
    input.candidateInviteExpiresAt <= (input.now ?? new Date())
  ) {
    return "unavailable";
  }
  return input.candidateInviteStatus === "accepted" ? "allowed" : "auto_accept";
}
