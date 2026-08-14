import { describe, expect, it, vi } from "vitest";
import type { ResumeReview } from "@arc/db-schema/resume-review";
import { createResumeRecordFromStorage } from "./create-from-storage";

vi.mock("../dao/skills", () => ({ syncResumeSkills: vi.fn() }));

describe("createResumeRecordFromStorage", () => {
  it("persists legacy artifact and attempt modes with an imported legacy review", async () => {
    const values = vi.fn((_values: unknown) => Promise.resolve());
    const executor = { insert: vi.fn(() => ({ values })) };
    const legacyReview = {
      overall: { baseScore: 80, conclusion: "符合岗位要求" },
    } as unknown as ResumeReview;

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
      executor as never,
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeEvaluationArtifactMode: "legacy",
        resumeEvaluationAttemptMode: "legacy",
        resumeReviewStatus: "ready",
      }),
    );
  });
});
