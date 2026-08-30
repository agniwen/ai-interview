export type CandidateStageBadgeVariant = "info" | "pink";

export function getCandidateStageBadgeVariant(
  stage: string | null | undefined,
): CandidateStageBadgeVariant | null {
  if (stage === "human_interview") {
    return "info";
  }
  if (stage === "offer") {
    return "pink";
  }
  return null;
}

export function getCandidateStageBadgeHoverRingClass(
  stage: string | null | undefined,
): string | null {
  if (stage === "human_interview") {
    return "hover:ring-sky-500/10";
  }
  if (stage === "offer") {
    return "hover:ring-pink-500/10";
  }
  return null;
}
