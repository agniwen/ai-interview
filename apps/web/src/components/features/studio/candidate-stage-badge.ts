export type CandidateStageBadgeVariant = "info" | "pink";

export function getCandidateStageBadgeVariant(
  stage: string | null | undefined,
): CandidateStageBadgeVariant | null {
  if (stage === "second_interview" || stage === "final_interview") {
    return "info";
  }
  if (
    stage === "income_proof" ||
    stage === "offer" ||
    stage === "background_check" ||
    stage === "onboarding"
  ) {
    return "pink";
  }
  return null;
}

export function getCandidateStageBadgeHoverRingClass(
  stage: string | null | undefined,
): string | null {
  if (stage === "second_interview" || stage === "final_interview") {
    return "hover:ring-sky-500/10";
  }
  if (
    stage === "income_proof" ||
    stage === "offer" ||
    stage === "background_check" ||
    stage === "onboarding"
  ) {
    return "hover:ring-pink-500/10";
  }
  return null;
}
