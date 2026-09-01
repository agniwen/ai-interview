import { describe, expect, it } from "vitest";
import { compactResumeProfileSnapshot } from "./resume-profile-snapshot.js";

const profile = {
  age: null,
  educationExperiences: [
    {
      degree: null,
      educationLevel: "本科",
      graduationYear: "2020",
      major: "计算机科学",
      period: "2016.09 - 2020.06",
      school: "浙江大学",
      summary: null,
    },
  ],
  email: null,
  gender: null,
  name: "测试候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: [],
  workExperiences: [
    {
      company: "极光矩阵",
      period: "2023.01 - 至今",
      role: "前端工程师",
      summary: null,
    },
  ],
  workYears: 3,
};

describe("compactResumeProfileSnapshot", () => {
  it("converts a stored resume profile into the list-card snapshot contract", () => {
    expect(compactResumeProfileSnapshot(profile)).toMatchObject({
      education: [{ primary: "浙江大学（本科）", secondary: "计算机科学" }],
      projects: [],
      work: [{ primary: "极光矩阵", secondary: "前端工程师" }],
    });
  });

  it("returns complete empty arrays for malformed legacy profiles", () => {
    expect(compactResumeProfileSnapshot({})).toEqual({
      education: [],
      educationHasMore: false,
      projects: [],
      projectsHasMore: false,
      work: [],
      workHasMore: false,
    });
  });
});
