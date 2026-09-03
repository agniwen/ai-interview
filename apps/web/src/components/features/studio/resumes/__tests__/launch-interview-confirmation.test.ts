import { describe, expect, it } from "vitest";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import {
  getStructuredLaunchConfirmation,
  requiresStructuredLaunchConfirmation,
} from "../launch-interview-dialog";

function detail(
  input: Pick<
    ResumeLibraryDetail,
    "jobEvaluationMode" | "structuredGateStatus" | "structuredScoreGrade"
  >,
): ResumeLibraryDetail {
  // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
  return {
    ...input,
    resumeEvaluationArtifactMode: input.jobEvaluationMode,
  } as ResumeLibraryDetail;
}

describe("structured AI interview launch confirmation", () => {
  it("requires confirmation for a failed gate or unmatched grade", () => {
    expect(
      requiresStructuredLaunchConfirmation(
        detail({
          jobEvaluationMode: "structured",
          structuredGateStatus: "failed",
          structuredScoreGrade: "recommended",
        }),
      ),
    ).toBe(true);
    expect(
      requiresStructuredLaunchConfirmation(
        detail({
          jobEvaluationMode: "structured",
          structuredGateStatus: "passed",
          structuredScoreGrade: "unmatched",
        }),
      ),
    ).toBe(true);
  });

  it("does not block matched, recommended, or legacy results", () => {
    expect(
      requiresStructuredLaunchConfirmation(
        detail({
          jobEvaluationMode: "structured",
          structuredGateStatus: "passed",
          structuredScoreGrade: "matched",
        }),
      ),
    ).toBe(false);
    expect(
      requiresStructuredLaunchConfirmation(
        detail({
          jobEvaluationMode: "legacy",
          structuredGateStatus: null,
          structuredScoreGrade: null,
        }),
      ),
    ).toBe(false);
  });

  it("binds confirmation to the displayed run, gate, and grade", () => {
    expect(
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      getStructuredLaunchConfirmation({
        jobEvaluationMode: "structured",
        resumeEvaluationArtifactMode: "structured",
        structuredGateStatus: "failed",
        structuredResumeEvaluation: { runId: "run-1" },
        structuredScoreGrade: "matched",
      } as ResumeLibraryDetail),
    ).toEqual({
      gateStatus: "failed",
      grade: "matched",
      runId: "run-1",
    });
  });
});
