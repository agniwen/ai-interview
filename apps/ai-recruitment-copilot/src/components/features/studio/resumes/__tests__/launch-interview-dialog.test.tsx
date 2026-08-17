import { describe, expect, it } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import {
  getStructuredLaunchConfirmation,
  requiresStructuredLaunchConfirmation,
} from "../launch-interview-dialog";

function makeDetail(overrides: Partial<ResumeLibraryDetail> = {}): ResumeLibraryDetail {
  // SAFETY: The helper supplies only the structured fields used by the pure confirmation rules.
  return {
    resumeEvaluationArtifactMode: "structured",
    structuredGateStatus: "failed",
    structuredResumeEvaluation: { runId: "run-1" },
    structuredScoreGrade: "unmatched",
    ...overrides,
  } as ResumeLibraryDetail;
}

describe("LaunchInterviewDialog structured launch confirmation", () => {
  it("requires confirmation for a below-threshold structured evaluation", () => {
    expect(requiresStructuredLaunchConfirmation(makeDetail())).toBe(true);
    expect(getStructuredLaunchConfirmation(makeDetail())).toEqual({
      gateStatus: "failed",
      grade: "unmatched",
      runId: "run-1",
    });
  });

  it("does not require confirmation when the evaluation is absent or passing", () => {
    expect(requiresStructuredLaunchConfirmation(null)).toBe(false);
    expect(
      requiresStructuredLaunchConfirmation(
        makeDetail({ structuredGateStatus: "passed", structuredScoreGrade: "matched" }),
      ),
    ).toBe(false);
    expect(getStructuredLaunchConfirmation(makeDetail({ structuredResumeEvaluation: null }))).toBe(
      null,
    );
  });
});
