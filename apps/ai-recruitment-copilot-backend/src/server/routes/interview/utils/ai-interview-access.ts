import type { CandidateInterviewInvitationStatus } from "@arc/db-schema/interview-notifications";
import type { ScheduleEntryStatus } from "@arc/db-schema/studio-interviews";

export function canStartAiInterviewRound(input: {
  candidateInviteExpiresAt: Date | null;
  candidateInviteStatus: CandidateInterviewInvitationStatus;
  candidateInviteTokenHash: string | null;
  now?: Date;
  roundStatus: ScheduleEntryStatus;
}): boolean {
  if (!input.candidateInviteTokenHash) {
    return true;
  }
  if (input.candidateInviteStatus !== "accepted") {
    return false;
  }
  if (input.roundStatus !== "pending") {
    return true;
  }
  return Boolean(
    input.candidateInviteExpiresAt && input.candidateInviteExpiresAt > (input.now ?? new Date()),
  );
}
