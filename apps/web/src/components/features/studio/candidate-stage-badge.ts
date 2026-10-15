export type CandidateStageBadgeVariant = "info" | "pink";

export function getCandidateStageBadgeVariant(
  stage: string | null | undefined,
): CandidateStageBadgeVariant | null {
  if (stage === "second_interview" || stage === "final_interview") {
    return "info";
  }
  if (
    stage === "income_proof" ||
    stage === "salary_negotiation" ||
    stage === "offer" ||
    stage === "background_check" ||
    stage === "onboarding"
  ) {
    return "pink";
  }
  return null;
}

export function getCandidateStageBadgeHoverClass(stage: string | null | undefined): string | null {
  if (stage === "second_interview" || stage === "final_interview") {
    return "hover:bg-sky-line";
  }
  if (
    stage === "income_proof" ||
    stage === "salary_negotiation" ||
    stage === "offer" ||
    stage === "background_check" ||
    stage === "onboarding"
  ) {
    return "hover:bg-pink-line";
  }
  return null;
}
