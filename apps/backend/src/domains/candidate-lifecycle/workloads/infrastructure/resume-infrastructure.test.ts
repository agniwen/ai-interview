import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { describe, expect, it } from "vitest";
import { projectResumeProfile } from "../../resume-library/resume-profile-projection.js";
import { computeResumeEvaluationInputHash } from "./resume-review.repository.js";

const structured: ResumeParserStructured = {
  age: 30,
  degree: "本科",
  education: "本科",
  educationExperiences: [],
  email: "candidate@example.com",
  gender: null,
  graduationYear: "2018",
  links: [],
  major: "计算机",
  name: "候选人",
  personalStrengths: ["交付稳定"],
  phone: "13800000000",
  projectExperiences: [
    {
      name: "平台",
      period: "2023-2024",
      role: "负责人",
      summary: "负责平台建设",
      techStack: ["TypeScript", "PostgreSQL"],
    },
  ],
  schools: ["某大学"],
  scoringFacts: {
    additionalEvidence: [],
    employmentEpisodes: [],
    projects: [],
    skillFacts: [],
    version: 1,
  },
  skills: ["TypeScript"],
  targetRoles: ["后端工程师"],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: 6,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: 6,
};

describe("resume infrastructure public seams", () => {
  it("projects parser output and de-duplicates project technology", () => {
    expect(projectResumeProfile(structured).skills).toEqual(["TypeScript", "PostgreSQL"]);
  });

  it("keeps contact details out of the evaluation idempotency hash", () => {
    const profile = projectResumeProfile(structured);
    const original = computeResumeEvaluationInputHash({
      resumeContentHash: "content",
      resumeProfile: profile,
      resumeText: "resume",
    });
    expect(
      computeResumeEvaluationInputHash({
        resumeContentHash: "content",
        resumeProfile: { ...profile, email: "changed@example.com", phone: "13900000000" },
        resumeText: "resume",
      }),
    ).toBe(original);
    expect(
      computeResumeEvaluationInputHash({
        resumeContentHash: "content",
        resumeProfile: { ...profile, skills: [...profile.skills, "Redis"] },
        resumeText: "resume",
      }),
    ).not.toBe(original);
  });
});
