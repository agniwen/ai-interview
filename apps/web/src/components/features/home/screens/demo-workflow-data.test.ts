import { expect, it } from "vitest";
import { qualitativeResumeEvaluationV2Schema } from "@app/db-schema/qualitative-resume-evaluation";
import { humanInterviewEvaluationDraftSchema } from "@app/db-schema/studio-interviews";
import {
  createDemoHumanRound,
  demoEvaluation,
  demoHumanEvaluation,
  demoOffer,
} from "./demo-workflow-data";

it("uses concrete valid evaluations and the same candidate across later stages", () => {
  expect(qualitativeResumeEvaluationV2Schema.parse(demoEvaluation).recommendationLevel).toBe(
    "highly_recommended",
  );
  expect(
    Object.values(demoEvaluation.dimensions).every((dimension) => dimension.level !== "undecided"),
  ).toBe(true);
  expect(humanInterviewEvaluationDraftSchema.parse(demoHumanEvaluation).rating).toBe("A");
  const scheduled = createDemoHumanRound(false);
  const completed = createDemoHumanRound(true);
  expect(scheduled.id).toBe(completed.id);
  expect(scheduled.interviewRecordId).toBe(demoOffer.interviewRecordId);
  expect(completed.outcome).toBe("pass");
  expect(completed.evaluationStatus).toBe("submitted");
});
