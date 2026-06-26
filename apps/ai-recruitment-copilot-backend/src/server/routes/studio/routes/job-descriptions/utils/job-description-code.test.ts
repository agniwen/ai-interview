import { globalConfigSchema } from "@arc/shared/global-config";
import { jobDescriptionFormSchema } from "@arc/shared/job-descriptions";
import { describe, expect, it } from "vitest";
import {
  buildJobDescriptionCodeCandidates,
  generateJobDescriptionCode,
  normalizeJobCodePrefix,
  pickAvailableJobDescriptionCode,
} from "./job-description-code";

describe("job description code helpers", () => {
  it("normalizes configured job code prefixes", () => {
    expect(normalizeJobCodePrefix("")).toBe("AUR");
    expect(normalizeJobCodePrefix(" aur ")).toBe("AUR");
    expect(normalizeJobCodePrefix(" hrd ")).toBe("HRD");
    expect(normalizeJobCodePrefix(null)).toBe("AUR");
  });

  it("generates a code from the configured prefix plus four base36 characters", () => {
    const createdAt = new Date("2026-06-22T15:34:59.000Z");
    const code = generateJobDescriptionCode({
      createdAt,
      prefix: " hrd ",
      random: () => 0,
    });

    expect(code).toBe("HRD0000");
  });

  it("builds unique candidate codes for retrying collisions from configured prefix", () => {
    const createdAt = new Date("2026-06-22T15:34:59.000Z");
    const candidates = buildJobDescriptionCodeCandidates({
      createdAt,
      prefix: "AUR",
      random: () => 0,
    });

    expect(candidates).toHaveLength(32);
    expect(new Set(candidates).size).toBe(32);
    expect(candidates.slice(0, 4)).toEqual(["AUR0000", "AUR0001", "AUR0002", "AUR0003"]);
    expect(candidates.every((code) => /^AUR[A-Z0-9]{4}$/.test(code))).toBe(true);
  });

  it("picks the first unused candidate code", () => {
    expect(
      pickAvailableJobDescriptionCode(["AUR0000", "AUR0001", "AUR0002"], ["AUR0000", "AUR0001"]),
    ).toBe("AUR0002");
    expect(pickAvailableJobDescriptionCode(["AUR0000"], ["AUR0000"])).toBeNull();
  });

  it("uses AUR as the default job code prefix in global config input", () => {
    const parsed = globalConfigSchema.parse({
      closingInstructions: "",
      companyContext: "",
      companyName: "",
      openingInstructions: "",
    });

    expect(parsed.jobCodePrefix).toBe("AUR");
  });

  it("normalizes custom global config prefixes", () => {
    const parsed = globalConfigSchema.parse({
      closingInstructions: "",
      companyContext: "",
      companyName: "",
      jobCodePrefix: "hrd",
      openingInstructions: "",
    });

    expect(parsed.jobCodePrefix).toBe("HRD");
  });

  it("normalizes a seven-character job description code input", () => {
    const parsed = jobDescriptionFormSchema.parse({
      allowCrossDepartmentInterviewers: false,
      code: " aur00az ",
      departmentId: "department-1",
      description: "",
      interviewerIds: ["interviewer-1"],
      name: "前端工程师",
      prompt: "考察前端能力",
    });

    expect(parsed.code).toBe("AUR00AZ");
  });

  it("accepts a custom three-character prefix in job description code input", () => {
    const parsed = jobDescriptionFormSchema.parse({
      allowCrossDepartmentInterviewers: false,
      code: " hrd00az ",
      departmentId: "department-1",
      description: "",
      interviewerIds: ["interviewer-1"],
      name: "前端工程师",
      prompt: "考察前端能力",
    });

    expect(parsed.code).toBe("HRD00AZ");
  });

  it("rejects invalid job description code input", () => {
    expect(() =>
      jobDescriptionFormSchema.parse({
        allowCrossDepartmentInterviewers: false,
        code: "AUR-26062215347",
        departmentId: "department-1",
        description: "",
        interviewerIds: ["interviewer-1"],
        name: "前端工程师",
        prompt: "考察前端能力",
      }),
    ).toThrow();
  });

  it("rejects legacy long job description code input", () => {
    expect(() =>
      jobDescriptionFormSchema.parse({
        allowCrossDepartmentInterviewers: false,
        code: "AUR26062215347",
        departmentId: "department-1",
        description: "",
        interviewerIds: ["interviewer-1"],
        name: "前端工程师",
        prompt: "考察前端能力",
      }),
    ).toThrow();
  });
});
