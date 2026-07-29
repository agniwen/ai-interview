import { describe, expect, it } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { requiresStructuredLaunchConfirmation } from "../launch-interview-dialog";

function detail(
  input: Pick<
    ResumeLibraryDetail,
    "jobEvaluationMode" | "structuredGateStatus" | "structuredScoreGrade"
  >,
): ResumeLibraryDetail {
  return input as ResumeLibraryDetail;
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
});
