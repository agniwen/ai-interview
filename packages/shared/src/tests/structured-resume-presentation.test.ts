import { describe, expect, it } from "vitest";
import { resolveStructuredResumePrimaryLabel } from "../structured-resume-presentation";

describe("resolveStructuredResumePrimaryLabel", () => {
  it("uses recruiter status first, then gate precedence, then grade", () => {
    expect(
      resolveStructuredResumePrimaryLabel({
        gateStatus: "failed",
        grade: "recommended",
        recruiterStatus: "pass",
      }),
    ).toEqual({ kind: "recruiter", label: "通过" });
    expect(
      resolveStructuredResumePrimaryLabel({
        gateStatus: "failed",
        grade: "recommended",
        recruiterStatus: null,
      }),
    ).toEqual({ kind: "gate", label: "未通过门槛" });
    expect(
      resolveStructuredResumePrimaryLabel({
        gateStatus: "needs_verification",
        grade: "recommended",
        recruiterStatus: null,
      }),
    ).toEqual({ kind: "gate", label: "门槛待核实" });
    expect(
      resolveStructuredResumePrimaryLabel({
        gateStatus: "passed",
        grade: "matched",
        recruiterStatus: null,
      }),
    ).toEqual({ kind: "grade", label: "匹配" });
  });
});
