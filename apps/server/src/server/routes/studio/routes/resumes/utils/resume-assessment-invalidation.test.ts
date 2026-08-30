import { describe, expect, it } from "vitest";
import {
  INVALIDATED_AI_RESUME_ASSESSMENT,
  INVALIDATED_RESUME_ASSESSMENT_FOR_JOB_CHANGE,
} from "./resume-assessment-invalidation";

describe("resume assessment invalidation", () => {
  it.each([INVALIDATED_AI_RESUME_ASSESSMENT, INVALIDATED_RESUME_ASSESSMENT_FOR_JOB_CHANGE])(
    "clears every qualitative current and attempt field",
    (values) => {
      expect(values).toMatchObject({
        qualitativeAttemptJobDescriptionVersionId: null,
        qualitativeJobDescriptionVersionId: null,
        qualitativeRecommendationLevel: null,
        qualitativeResumeEvaluation: null,
        resumeEvaluationArtifactMode: null,
        resumeEvaluationAttemptMode: null,
      });
    },
  );
});
