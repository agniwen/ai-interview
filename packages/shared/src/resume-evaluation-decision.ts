import type { ResumeReviewAction } from "@arc/db-schema/resume-review";
import type { ResumeScreeningResult } from "./resume-screening";

export function constrainNextStepAction(input: {
  action: ResumeReviewAction;
  screening?: ResumeScreeningResult | null;
}): ResumeReviewAction {
  if (
    input.screening?.policyEnabled &&
    !input.screening.policyEmpty &&
    input.screening.recommendation === "hold" &&
    input.action === "interview"
  ) {
    return "hold";
  }
  return input.action;
}
