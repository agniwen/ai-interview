import type { HumanInterviewCandidateMaterialListItem } from "@app/shared/human-interview-candidate-materials";
import type { HumanInterviewMeetingStatus } from "@app/db-schema/studio-interviews";

export type HumanMeetingViewMode = "materials" | "meeting" | "review";

export function resolveInitialHumanMeetingViewMode(
  mode: "candidate" | "interviewer",
  status: HumanInterviewMeetingStatus,
): HumanMeetingViewMode {
  return mode === "interviewer" && status === "ended" ? "review" : "meeting";
}

export function resolveEffectiveCandidateId(
  candidates: HumanInterviewCandidateMaterialListItem[],
  selectedCandidateId: string | null,
): string | null {
  return candidates.some((candidate) => candidate.id === selectedCandidateId)
    ? selectedCandidateId
    : (candidates[0]?.id ?? null);
}

export function shouldReturnToMeetingForLocalScreenShare(
  viewMode: HumanMeetingViewMode,
  hasLocalScreenShare: boolean,
) {
  return viewMode !== "meeting" && hasLocalScreenShare;
}
