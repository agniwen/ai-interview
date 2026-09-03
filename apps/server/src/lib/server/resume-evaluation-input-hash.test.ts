import { describe, expect, it } from "vitest";
import { computeResumeEvaluationInputHash } from "./resume-evaluation-input-hash";

const profile = {
  age: 30,
  educationExperiences: [],
  email: "a@example.com",
  gender: "男",
  name: "候选人甲",
  personalStrengths: ["负责"],
  phone: "13800000000",
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript"],
  targetRoles: ["工程师"],
  workExperiences: [],
  workYears: 5,
};

describe("computeResumeEvaluationInputHash", () => {
  it("ignores contact identity but includes content fields and file digest", () => {
    const first = computeResumeEvaluationInputHash({
      resumeContentHash: "file-a",
      resumeProfile: profile,
      resumeText: "正文",
    });
    const contactOnly = computeResumeEvaluationInputHash({
      resumeContentHash: "file-a",
      resumeProfile: {
        ...profile,
        email: "b@example.com",
        name: "候选人乙",
        phone: "13900000000",
      },
      resumeText: "正文",
    });
    const evidenceChanged = computeResumeEvaluationInputHash({
      resumeContentHash: "file-a",
      resumeProfile: { ...profile, skills: ["TypeScript", "PostgreSQL"] },
      resumeText: "正文",
    });
    const fileChanged = computeResumeEvaluationInputHash({
      resumeContentHash: "file-b",
      resumeProfile: profile,
      resumeText: "正文",
    });

    expect(contactOnly).toBe(first);
    expect(evidenceChanged).not.toBe(first);
    expect(fileChanged).not.toBe(first);
  });

  it("uses an explicit canonical null for a missing file digest", () => {
    expect(
      computeResumeEvaluationInputHash({
        resumeContentHash: null,
        resumeProfile: profile,
        resumeText: null,
      }),
    ).toBe(
      computeResumeEvaluationInputHash({
        resumeContentHash: undefined,
        resumeProfile: profile,
        resumeText: null,
      }),
    );
  });
});
