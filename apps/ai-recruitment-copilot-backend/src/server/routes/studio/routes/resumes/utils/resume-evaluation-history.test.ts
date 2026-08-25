import { describe, expect, it } from "vitest";
import {
  buildPreQualitativeEvaluationArchive,
  deriveResumeEvaluationContractVersion,
  PRE_QUALITATIVE_CURRENT_ARCHIVE_RUN_ID,
} from "./resume-evaluation-history";

describe("resume evaluation history", () => {
  it("preserves the structured schema, engine, and prompt contract versions", () => {
    const artifact = {
      engine: {
        engineVersion: "structured-resume-engine-v1",
        modelId: "model-does-not-define-contract",
        promptVersion: "prompt-v3",
      },
      schemaVersion: 1,
    };
    expect(deriveResumeEvaluationContractVersion("structured", artifact)).toBe(
      "structured-v1:engine=structured-resume-engine-v1:prompt=prompt-v3",
    );
  });

  it("archives legacy notes before invalidation with a stable synthetic run id", () => {
    const archive = buildPreQualitativeEvaluationArchive({
      organizationId: "org-1",
      record: {
        notes: "旧版综合评价",
        qualitativeJobDescriptionVersionId: null,
        qualitativeResumeEvaluation: null,
        resumeEvaluationArtifactMode: "legacy",
        resumeReview: null,
        resumeReviewGeneratedAt: "2026-08-20T00:00:00.000Z",
        structuredCompositeScore: null,
        structuredResumeEvaluation: null,
      },
      resumeRecordId: "resume-1",
    });
    expect(archive).toMatchObject({
      artifact: { notes: "旧版综合评价" },
      contractVersion: "legacy-unknown",
      runId: PRE_QUALITATIVE_CURRENT_ARCHIVE_RUN_ID,
    });
  });
});
