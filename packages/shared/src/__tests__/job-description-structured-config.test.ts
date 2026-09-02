import { describe, expect, it } from "vitest";
import {
  createDefaultJobDescriptionStructuredConfig,
  jobDescriptionStructuredConfigSchema,
} from "../job-descriptions";
import { parseStoredJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";

describe("job description structured config", () => {
  it("creates the confirmed six-dimension defaults", () => {
    const config = createDefaultJobDescriptionStructuredConfig();
    expect(config).toEqual({
      deductionRules: expect.objectContaining({
        "experience.missing_year": { enabled: true, points: 9 },
        "skill.missing_core": { enabled: true, points: 14 },
        "stability.short_tenure": { enabled: true, points: 12 },
      }),
      exclusionConditions: [],
      hardGates: {
        education: "",
        languageAbility: "",
        other: "",
        requiredCertificates: "",
        requiredSkills: "",
        workExperience: "",
        workLocation: "",
      },
      priorityConditions: [],
      version: 1,
      weights: {
        educationBackground: 10,
        experienceRelevance: 25,
        potential: 8,
        projectMatch: 15,
        skillMatch: 35,
        stability: 7,
      },
    });
    expect(Object.keys(config.deductionRules)).toHaveLength(23);
  });

  it("fills the V1 deduction defaults without discarding existing structured settings", () => {
    const { deductionRules: _, ...existingV1Config } =
      createDefaultJobDescriptionStructuredConfig();
    existingV1Config.hardGates.requiredSkills = "TypeScript";
    existingV1Config.weights.skillMatch = 40;
    existingV1Config.weights.experienceRelevance = 20;

    const parsed = parseStoredJobDescriptionStructuredConfig(existingV1Config);

    expect(parsed.hardGates.requiredSkills).toBe("TypeScript");
    expect(parsed.weights.skillMatch).toBe(40);
    expect(parsed.deductionRules["skill.missing_core"]).toEqual({
      enabled: true,
      points: 14,
    });
  });

  it("accepts zero-weight dimensions when all weights still total 100", () => {
    const config = createDefaultJobDescriptionStructuredConfig();

    expect(
      jobDescriptionStructuredConfigSchema.parse({
        ...config,
        weights: {
          educationBackground: 0,
          experienceRelevance: 35,
          potential: 0,
          projectMatch: 20,
          skillMatch: 45,
          stability: 0,
        },
      }).weights,
    ).toEqual({
      educationBackground: 0,
      experienceRelevance: 35,
      potential: 0,
      projectMatch: 20,
      skillMatch: 45,
      stability: 0,
    });
  });

  it("rejects non-integer weights and totals other than 100", () => {
    const config = createDefaultJobDescriptionStructuredConfig();

    expect(() =>
      jobDescriptionStructuredConfigSchema.parse({
        ...config,
        weights: { ...config.weights, skillMatch: 34.5 },
      }),
    ).toThrow();
    expect(() =>
      jobDescriptionStructuredConfigSchema.parse({
        ...config,
        weights: { ...config.weights, skillMatch: 34 },
      }),
    ).toThrow();
  });

  it("stores separate condition text and integer point magnitudes", () => {
    const config = createDefaultJobDescriptionStructuredConfig();
    const parsed = jobDescriptionStructuredConfigSchema.parse({
      ...config,
      exclusionConditions: [
        {
          condition: " 行业完全不匹配 ",
          id: "rule-exclusion-1",
          points: 28,
        },
      ],
      priorityConditions: [
        {
          condition: " 有头部企业项目经验 ",
          id: "rule-priority-1",
          points: 5,
        },
      ],
    });

    expect(parsed.priorityConditions[0]?.condition).toBe("有头部企业项目经验");
    expect(parsed.exclusionConditions[0]?.points).toBe(28);
  });

  it("rejects zero, decimal, and out-of-range condition points", () => {
    const config = createDefaultJobDescriptionStructuredConfig();

    for (const points of [0, 1.5, 101]) {
      expect(() =>
        jobDescriptionStructuredConfigSchema.parse({
          ...config,
          priorityConditions: [
            {
              condition: "测试条件",
              id: "rule-priority-1",
              points,
            },
          ],
        }),
      ).toThrow();
    }
  });
});
