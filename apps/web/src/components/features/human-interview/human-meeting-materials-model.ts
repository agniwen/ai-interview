import type { HumanInterviewCandidateMaterialListItem } from "@arc/shared/human-interview-candidate-materials";

export type HumanMeetingViewMode = "materials" | "meeting";

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
  return viewMode === "materials" && hasLocalScreenShare;
}
