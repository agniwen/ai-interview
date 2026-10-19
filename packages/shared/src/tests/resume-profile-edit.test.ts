import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import {
  applyResumeProfileEdit,
  resumeProfileEditSchema,
  toResumeProfileEditInput,
} from "@app/shared/resume-profile-edit";

const profile: ResumeProfile = {
  age: 28,
  educationExperiences: [],
  email: "lan@example.com",
  gender: "男",
  name: "兰星",
  personalStrengths: ["沟通清晰"],
  phone: "13800000000",
  projectExperiences: [],
  schools: ["浙江大学"],
  scoringFacts: {
    additionalEvidence: [],
    employmentEpisodes: [],
    projects: [],
    skillFacts: [],
    version: 1,
  },
  skills: ["Go"],
  targetRoles: ["后端工程师"],
  workExperiences: [{ company: "字节跳动", period: "2020 - 至今", role: "工程师", summary: null }],
  workYears: 5,
};

describe("resumeProfileEditSchema", () => {
  it("normalizes blank optional text to null", () => {
    const parsed = resumeProfileEditSchema.parse({
      ...toResumeProfileEditInput(profile),
      email: "  ",
      workExperiences: [{ company: "", period: null, role: " 架构师 ", summary: "" }],
    });

    expect(parsed.email).toBeNull();
    expect(parsed.workExperiences).toEqual([
      { company: null, period: null, role: "架构师", summary: null },
    ]);
  });

  it("requires a candidate name and valid numbers", () => {
    const base = toResumeProfileEditInput(profile);

    expect(resumeProfileEditSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(resumeProfileEditSchema.safeParse({ ...base, age: 28.5 }).success).toBe(false);
    expect(resumeProfileEditSchema.safeParse({ ...base, workYears: Number.NaN }).success).toBe(
      false,
    );
  });
});

describe("applyResumeProfileEdit", () => {
  it("replaces editable facts while preserving derived scoring facts", () => {
    const edit = resumeProfileEditSchema.parse({
      ...toResumeProfileEditInput(profile),
      skills: ["Rust"],
      workExperiences: [],
    });

    const next = applyResumeProfileEdit(profile, edit);

    expect(next.skills).toEqual(["Rust"]);
    expect(next.workExperiences).toEqual([]);
    expect(next.scoringFacts).toBe(profile.scoringFacts);
  });
});
