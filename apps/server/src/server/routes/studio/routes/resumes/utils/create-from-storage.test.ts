import { describe, expect, it, vi } from "vitest";
import type { ResumeReview } from "@app/db-schema/resume-review";
import { createResumeRecordFromStorage } from "./create-from-storage";

describe("createResumeRecordFromStorage", () => {
  it("persists a requested initial recruitment stage", async () => {
    const createRecords = vi.fn(() => Promise.resolve([]));
    const executor = {};

    await createResumeRecordFromStorage(
      {
        candidateEmail: null,
        candidateName: "候选人",
        candidatePhone: null,
        contentHash: "resume-hash-stage",
        jobDescriptionId: "job-1",
        notes: null,
        organizationId: "org-1",
        pipelineStage: "second_interview",
        resumeFileName: "resume.pdf",
        resumeProfile: null,
        storageKey: "resumes/resume.pdf",
        targetRole: null,
        userId: "user-1",
      },
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      executor as never,
      { createRecords, syncSkills: vi.fn() },
    );

    expect(createRecords).toHaveBeenCalledWith(
      executor,
      expect.objectContaining({ pipelineStage: "second_interview" }),
    );
  });

  it("persists legacy artifact and attempt modes with an imported legacy review", async () => {
    const createRecords = vi.fn(() => Promise.resolve([]));
    const executor = {};
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const legacyReview = {
      overall: { baseScore: 80, conclusion: "符合岗位要求" },
    } as ResumeReview;

    await createResumeRecordFromStorage(
      {
        candidateEmail: null,
        candidateName: "候选人",
        candidatePhone: null,
        contentHash: "resume-hash",
        jobDescriptionId: "job-1",
        notes: null,
        organizationId: "org-1",
        resumeFileName: "resume.pdf",
        resumeProfile: null,
        resumeReview: legacyReview,
        storageKey: "resumes/resume.pdf",
        targetRole: null,
        userId: "user-1",
      },
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      executor as never,
      { createRecords, syncSkills: vi.fn() },
    );

    expect(createRecords).toHaveBeenCalledWith(
      executor,
      expect.objectContaining({
        resumeEvaluationArtifactMode: "legacy",
        resumeEvaluationAttemptMode: "legacy",
        resumeReviewStatus: "ready",
      }),
    );
  });
});
