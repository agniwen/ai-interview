import { describe, expect, it } from "vitest";
import {
  calculateRemainingRecords,
  mergeEducationExperiencesIntoProfile,
  parseBackfillConcurrency,
  parseBackfillTarget,
  serializeResumeBackfillLog,
} from "./backfill-resume-profiles";

describe("backfill resume profiles helpers", () => {
  it("merges education experiences without changing other profile fields", () => {
    const profile = {
      age: 28,
      email: "old@example.com",
      gender: "男",
      name: "郭靖",
      personalStrengths: ["稳定"],
      phone: "13800138000",
      projectExperiences: [],
      schools: ["旧学校"],
      skills: ["React"],
      targetRoles: ["前端工程师"],
      workExperiences: [],
      workYears: 5,
    };
    const educationExperiences = [
      {
        degree: "学士",
        educationLevel: "本科",
        graduationYear: "2020",
        major: "计算机科学与技术",
        period: "2016.09-2020.06",
        school: "清华大学",
        summary: "统招本科",
      },
    ];

    expect(mergeEducationExperiencesIntoProfile(profile, educationExperiences)).toEqual({
      ...profile,
      educationExperiences,
    });
  });

  it("parses target scope with all as the safe default", () => {
    expect(parseBackfillTarget()).toBe("all");
    expect(parseBackfillTarget("PRIVATE")).toBe("private");
    expect(parseBackfillTarget("pool")).toBe("pool");
    expect(() => parseBackfillTarget("unknown")).toThrow("BACKFILL_RESUME_PROFILE_TARGET");
  });

  it("uses six workers by default and validates concurrency overrides", () => {
    expect(parseBackfillConcurrency()).toBe(6);
    expect(parseBackfillConcurrency("3")).toBe(3);
    expect(() => parseBackfillConcurrency("0")).toThrow("BACKFILL_RESUME_PROFILE_CONCURRENCY");
  });

  it("calculates remaining records after each completed item", () => {
    expect(calculateRemainingRecords({ completed: 1, total: 10 })).toBe(9);
    expect(calculateRemainingRecords({ completed: 10, total: 10 })).toBe(0);
    expect(calculateRemainingRecords({ completed: 11, total: 10 })).toBe(0);
  });

  it("serializes record logs as single-line JSON", () => {
    const line = serializeResumeBackfillLog({
      event: "record_succeeded",
      recordId: "resume_1",
      recordType: "private",
      resumeProfile: { name: "郭靖" },
    });

    expect(line).toBe(
      '{"event":"record_succeeded","recordId":"resume_1","recordType":"private","resumeProfile":{"name":"郭靖"}}',
    );
    expect(line).not.toContain("\n");
  });
});
