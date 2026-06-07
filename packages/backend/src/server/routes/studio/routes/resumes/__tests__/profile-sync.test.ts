import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { syncResumeProfileIdentity } from "@arc/backend/server/routes/studio/routes/resumes/utils/profile-sync";

const baseProfile: ResumeProfile = {
  age: null,
  email: "old@example.com",
  gender: null,
  name: "旧姓名",
  personalStrengths: [],
  phone: "13800000000",
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师", "全栈工程师"],
  workExperiences: [],
  workYears: null,
};

describe("syncResumeProfileIdentity", () => {
  it("syncs edited identity fields into resumeProfile", () => {
    const synced = syncResumeProfileIdentity(baseProfile, {
      candidateEmail: " new@example.com ",
      candidateName: " 新姓名 ",
      candidatePhone: " 13900000000 ",
      targetRole: " 后端工程师 ",
    });

    expect(synced).toMatchObject({
      email: "new@example.com",
      name: "新姓名",
      phone: "13900000000",
      targetRoles: ["后端工程师"],
    });
    expect(synced?.skills).toEqual(["React"]);
  });

  it("preserves required profile fields when editable values are blank", () => {
    const synced = syncResumeProfileIdentity(baseProfile, {
      candidateEmail: "",
      candidateName: "",
      candidatePhone: "",
      targetRole: "",
    });

    expect(synced).toMatchObject({
      email: null,
      name: "旧姓名",
      phone: null,
      targetRoles: [],
    });
  });

  it("does not synthesize a profile for rows without structured information", () => {
    expect(
      syncResumeProfileIdentity(null, {
        candidateEmail: "new@example.com",
        candidateName: "新姓名",
        candidatePhone: "13900000000",
        targetRole: "后端工程师",
      }),
    ).toBeNull();
  });
});
