import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  computeResumeScreeningPolicyHash,
  deriveJdRequiredSkills,
  evaluateResumeScreening,
} from "../resume-screening";
import type { ResumeScreeningPolicy } from "../resume-screening";

const PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [
    {
      degree: "学士",
      educationLevel: "本科",
      graduationYear: "2020",
      major: "计算机科学",
      period: "2016-2020",
      school: "某大学",
      summary: null,
    },
  ],
  email: null,
  gender: "未发现信息",
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [
    {
      name: "后台系统",
      period: "2023",
      role: "前端负责人",
      summary: "负责 React 前端架构",
      techStack: ["React.js", "TypeScript"],
    },
  ],
  schools: ["某大学"],
  skills: ["React.js", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 4,
};

function makePolicy(overrides: Partial<ResumeScreeningPolicy> = {}): ResumeScreeningPolicy {
  return {
    enabled: true,
    rules: [],
    version: 1,
    ...overrides,
  };
}

describe("evaluateResumeScreening", () => {
  it("returns an empty pass result when screening policy is disabled", () => {
    const result = evaluateResumeScreening({
      policy: makePolicy({ enabled: false }),
      resumeProfile: PROFILE,
    });

    expect(result).toMatchObject({
      policyEmpty: true,
      policyEnabled: false,
      recommendation: "pass",
      ruleResults: [],
    });
  });

  it("evaluates field rules without AI evidence", () => {
    const result = evaluateResumeScreening({
      policy: makePolicy({
        rules: [
          {
            field: "minimumEducation",
            id: "edu",
            level: "硕士",
            severity: "blocking",
            type: "field",
          },
          {
            field: "minimumWorkYears",
            id: "years",
            severity: "warning",
            type: "field",
            years: 3,
          },
        ],
      }),
      resumeProfile: PROFILE,
    });

    expect(result.recommendation).toBe("hold");
    expect(result.ruleResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "edu",
          status: "fail",
        }),
        expect.objectContaining({
          ruleId: "years",
          status: "pass",
        }),
      ]),
    );
  });

  it("uses skill matchMode with semantic evidence results", () => {
    const result = evaluateResumeScreening({
      evidence: {
        skillResults: [
          { evidence: [], skill: "React", status: "matched" },
          { evidence: [], skill: "TypeScript", status: "matched" },
          { evidence: [], skill: "GraphQL", status: "not_found" },
        ],
      },
      policy: makePolicy({
        rules: [
          {
            id: "skills",
            matchMode: { count: 2, type: "at_least" },
            requiredSkills: ["React", "TypeScript", "GraphQL"],
            severity: "blocking",
            type: "skill",
          },
        ],
      }),
      resumeProfile: PROFILE,
    });

    expect(result.recommendation).toBe("pass");
    expect(result.ruleResults[0]).toMatchObject({
      reason: "已匹配 2/3 项技能，达到至少 2 项要求。",
      status: "pass",
    });
  });

  it("treats missing field data as unknown instead of failure", () => {
    const result = evaluateResumeScreening({
      policy: makePolicy({
        rules: [
          {
            field: "minimumWorkYears",
            id: "years",
            severity: "blocking",
            type: "field",
            years: 5,
          },
        ],
      }),
      resumeProfile: { ...PROFILE, workYears: null },
    });

    expect(result.recommendation).toBe("flag");
    expect(result.ruleResults[0]).toMatchObject({
      status: "unknown",
    });
  });
});

describe("computeResumeScreeningPolicyHash", () => {
  it("ignores disabled rules and preserves semantic changes", () => {
    const base = makePolicy({
      rules: [
        {
          field: "minimumEducation",
          id: "edu",
          level: "本科",
          severity: "warning",
          type: "field",
        },
      ],
    });
    const sameMeaning = makePolicy({
      rules: [
        {
          field: "minimumEducation",
          id: "different-id",
          level: "本科",
          severity: "warning",
          type: "field",
        },
      ],
    });
    const changed = makePolicy({
      rules: [
        {
          field: "minimumEducation",
          id: "edu",
          level: "硕士",
          severity: "warning",
          type: "field",
        },
      ],
    });

    expect(computeResumeScreeningPolicyHash(base)).toBe(
      computeResumeScreeningPolicyHash(sameMeaning),
    );
    expect(computeResumeScreeningPolicyHash(base)).not.toBe(
      computeResumeScreeningPolicyHash(changed),
    );
  });
});

describe("deriveJdRequiredSkills", () => {
  it("flattens skill rules and dedupes case-insensitively, ignoring non-skill rules", () => {
    const policy: ResumeScreeningPolicy = {
      enabled: true,
      rules: [
        {
          id: "r1",
          label: "后端技能",
          matchMode: { type: "all" },
          requiredSkills: ["Java", "Spring", "java"],
          severity: "blocking",
          type: "skill",
        },
        {
          id: "r2",
          label: "前端技能",
          matchMode: { count: 1, type: "at_least" },
          requiredSkills: ["React", " Spring "],
          severity: "warning",
          type: "skill",
        },
        { id: "r3", label: "语义", requirement: "有大厂经验", severity: "info", type: "semantic" },
      ],
      version: 1,
    };
    expect(deriveJdRequiredSkills(policy)).toEqual(["Java", "Spring", "React"]);
  });

  it("returns [] for null / missing / malformed policy (raw jsonb safe)", () => {
    expect(deriveJdRequiredSkills(null)).toEqual([]);
    expect(deriveJdRequiredSkills()).toEqual([]);
    expect(deriveJdRequiredSkills({ rules: "nope" })).toEqual([]);
  });
});
