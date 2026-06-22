import { globalConfigSchema } from "@arc/shared/global-config";
import { jobDescriptionFormSchema } from "@arc/shared/job-descriptions";
import { describe, expect, it } from "vitest";
import {
  buildJobDescriptionCodeCandidates,
  formatJobCodeTimestamp,
  generateJobDescriptionCode,
  normalizeJobCodePrefix,
  pickAvailableJobDescriptionCode,
} from "./job-description-code";

describe("job description code helpers", () => {
  it("normalizes empty or lowercase prefixes", () => {
    expect(normalizeJobCodePrefix("")).toBe("AUR");
    expect(normalizeJobCodePrefix(" aur ")).toBe("AUR");
    expect(normalizeJobCodePrefix(null)).toBe("AUR");
  });

  it("formats the backend creation timestamp as YYMMDDHHMM", () => {
    const createdAt = new Date("2026-06-22T15:34:59.000Z");
    expect(formatJobCodeTimestamp(createdAt)).toBe("2606221534");
  });

  it("generates a code with prefix, timestamp, and random digit", () => {
    const createdAt = new Date("2026-06-22T15:34:59.000Z");
    const code = generateJobDescriptionCode({
      createdAt,
      prefix: " aur ",
      randomDigit: () => 7,
    });

    expect(code).toBe("AUR26062215347");
  });

  it("builds ten unique candidate codes for retrying collisions", () => {
    const createdAt = new Date("2026-06-22T15:34:59.000Z");
    const candidates = buildJobDescriptionCodeCandidates({
      createdAt,
      prefix: "JD",
      random: () => 0,
    });

    expect(candidates).toHaveLength(10);
    expect(new Set(candidates).size).toBe(10);
    expect(candidates).toEqual([
      "JD26062215340",
      "JD26062215341",
      "JD26062215342",
      "JD26062215343",
      "JD26062215344",
      "JD26062215345",
      "JD26062215346",
      "JD26062215347",
      "JD26062215348",
      "JD26062215349",
    ]);
  });

  it("picks the first unused candidate code", () => {
    expect(
      pickAvailableJobDescriptionCode(
        ["AUR26062215340", "AUR26062215341", "AUR26062215342"],
        ["AUR26062215340", "AUR26062215341"],
      ),
    ).toBe("AUR26062215342");
    expect(pickAvailableJobDescriptionCode(["AUR26062215340"], ["AUR26062215340"])).toBeNull();
  });

  it("adds a default job code prefix to global config input", () => {
    const parsed = globalConfigSchema.parse({
      closingInstructions: "",
      companyContext: "",
      companyName: "",
      openingInstructions: "",
    });

    expect(parsed.jobCodePrefix).toBe("AUR");
  });

  it("rejects non-empty invalid prefixes in global config input", () => {
    expect(() =>
      globalConfigSchema.parse({
        closingInstructions: "",
        companyContext: "",
        companyName: "",
        jobCodePrefix: "AUR-",
        openingInstructions: "",
      }),
    ).toThrow();
  });

  it("normalizes an optional generated code in job description input", () => {
    const parsed = jobDescriptionFormSchema.parse({
      allowCrossDepartmentInterviewers: false,
      code: " aur26062215347 ",
      departmentId: "department-1",
      description: "",
      interviewerIds: ["interviewer-1"],
      name: "前端工程师",
      prompt: "考察前端能力",
    });

    expect(parsed.code).toBe("AUR26062215347");
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
});
