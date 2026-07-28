import { describe, expect, it } from "vitest";
import {
  createDefaultJobDescriptionStructuredConfig,
  jobDescriptionStructuredConfigSchema,
} from "../job-descriptions";

describe("job description structured config", () => {
  it("creates the confirmed six-dimension defaults", () => {
    expect(createDefaultJobDescriptionStructuredConfig()).toEqual({
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
