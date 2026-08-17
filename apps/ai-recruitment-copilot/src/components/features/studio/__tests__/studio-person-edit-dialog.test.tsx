import { describe, expect, it } from "vitest";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { createResumeEditFormValues } from "../studio-person-edit-dialog";

describe("StudioPersonEditDialog resume form values", () => {
  it("returns empty editable fields when the detail is unavailable", () => {
    expect(createResumeEditFormValues(null)).toEqual({
      candidateEmail: "",
      candidateName: "",
      candidatePhone: "",
      hrResumeAssessment: "",
      jobDescriptionId: "",
      notes: "",
      resumeEvaluationStatus: "unreviewed",
      targetRole: "",
    });
  });

  it("normalizes nullable resume identity fields for the edit form", () => {
    // SAFETY: Only the fields read by createResumeEditFormValues are needed for this fixture.
    const detail = {
      candidateEmail: null,
      candidateName: "候选人",
      candidatePhone: null,
      hrResumeAssessment: null,
      jobDescriptionId: null,
      notes: null,
      resumeEvaluationStatus: null,
      targetRole: null,
    } as ResumeLibraryDetail;

    expect(createResumeEditFormValues(detail)).toEqual({
      candidateEmail: "",
      candidateName: "候选人",
      candidatePhone: "",
      hrResumeAssessment: "",
      jobDescriptionId: "",
      notes: "",
      resumeEvaluationStatus: "unreviewed",
      targetRole: "",
    });
  });
});
