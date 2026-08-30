// src/server/agents/__tests__/resume-parser-agent.test.ts
//
// `projectAttachmentToResumeProfile` 把 chat_attachment 行的 superset
// 投影到 ResumeProfile 子集，形状不符时返回 null。
import { describe, expect, it } from "vitest";
import { resumeParserGenerationSchema } from "@arc/db-schema/resume-parser-schema";
import {
  projectAttachmentToResumeProfile,
  toResumeProfile,
} from "@app/server/server/agents/resume-parser-agent";

const MINIMAL_STRUCTURED = {
  age: 28,
  degree: null,
  education: null,
  educationExperiences: [
    {
      degree: "学士",
      educationLevel: "本科",
      graduationYear: "2020",
      major: "计算机科学与技术",
      period: "2016.09-2020.06",
      school: "清华大学",
      summary: "统招本科",
    },
  ],
  email: null,
  gender: "男",
  graduationYear: null,
  links: [],
  major: null,
  name: "郭靖",
  personalStrengths: ["沟通"],
  phone: null,
  projectExperiences: [],
  schools: ["清华大学"],
  scoringFacts: {
    additionalEvidence: [],
    employmentEpisodes: [],
    projects: [],
    skillFacts: [
      {
        evidence: ["TypeScript"],
        evidenceLevel: "mentioned" as const,
        normalizedSkill: "TypeScript",
      },
    ],
    version: 1 as const,
  },
  skills: ["TypeScript"],
  targetRoles: ["前端工程师"],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: null,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: 5,
};

describe("projectAttachmentToResumeProfile", () => {
  it("accepts a core resume when optional scoring facts or work years are malformed", () => {
    const parsed = resumeParserGenerationSchema.safeParse({
      ...MINIMAL_STRUCTURED,
      scoringFacts: {
        additionalEvidence: [],
        employmentEpisodes: [],
        projects: [],
        skillFacts: [{ evidence: [], evidenceLevel: "使用过", normalizedSkill: "TypeScript" }],
        version: 1,
      },
      workYears: undefined,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data.scoringFacts).toEqual({
      additionalEvidence: [],
      employmentEpisodes: [],
      projects: [],
      skillFacts: [],
      version: 1,
    });
    expect(parsed.data.workYears).toBeNull();
  });

  it("returns null when input is null", () => {
    expect(projectAttachmentToResumeProfile(null)).toBeNull();
  });

  it("returns null when input does not match structured schema", () => {
    expect(projectAttachmentToResumeProfile({ random: "shape" })).toBeNull();
  });

  it("rejects a legacy cache entry that has no reusable scoring facts", () => {
    const { scoringFacts: _scoringFacts, ...legacyStructured } = MINIMAL_STRUCTURED;

    expect(projectAttachmentToResumeProfile(legacyStructured)).toBeNull();
  });

  it("projects a valid superset down to ResumeProfile", () => {
    const result = projectAttachmentToResumeProfile(MINIMAL_STRUCTURED);
    expect(result).not.toBeNull();
    expect(result).toEqual(toResumeProfile(MINIMAL_STRUCTURED));
    expect(result?.educationExperiences).toEqual(MINIMAL_STRUCTURED.educationExperiences);
  });

  it("includes project tech stacks in the projected top-level skills", () => {
    const result = projectAttachmentToResumeProfile({
      ...MINIMAL_STRUCTURED,
      projectExperiences: [
        {
          name: "招聘系统",
          period: "2024",
          role: "前端负责人",
          summary: "负责候选人筛选模块",
          techStack: ["React", "TypeScript", "Kubernetes"],
        },
      ],
      skills: ["TypeScript"],
    });

    expect(result?.skills).toEqual(["TypeScript", "React", "Kubernetes"]);
  });

  it("defaults education experiences to an empty list for legacy cached structured data", () => {
    const { educationExperiences: _educationExperiences, ...legacyStructured } = MINIMAL_STRUCTURED;
    const result = projectAttachmentToResumeProfile(legacyStructured);

    expect(result).not.toBeNull();
    expect(result?.educationExperiences).toEqual([]);
    expect(result?.scoringFacts).toEqual({
      additionalEvidence: [],
      employmentEpisodes: [],
      projects: [],
      skillFacts: [
        {
          evidence: ["TypeScript"],
          evidenceLevel: "mentioned",
          normalizedSkill: "TypeScript",
        },
      ],
      version: 1,
    });
  });

  it("preserves reusable scoring facts from the initial resume parse", () => {
    const result = projectAttachmentToResumeProfile({
      ...MINIMAL_STRUCTURED,
      scoringFacts: {
        additionalEvidence: ["PMP 认证"],
        employmentEpisodes: [
          {
            currentStatus: "current",
            endMonth: null,
            evidence: ["2021.06-至今"],
            gapExplanation: null,
            primaryStatus: "primary",
            sourceIndex: 0,
            startMonth: "2021-06",
          },
        ],
        projects: [],
        skillFacts: [
          {
            evidence: ["使用 TypeScript 开发"],
            evidenceLevel: "applied",
            normalizedSkill: "TypeScript",
          },
        ],
        version: 1,
      },
      workExperiences: [
        {
          company: "示例公司",
          period: "2021.06-至今",
          role: "前端工程师",
          summary: "使用 TypeScript 开发",
        },
      ],
    });

    expect(result?.scoringFacts).toMatchObject({
      additionalEvidence: ["PMP 认证"],
      employmentEpisodes: [
        {
          currentStatus: "current",
          sourceIndex: 0,
          startMonth: "2021-06",
        },
      ],
      skillFacts: [
        {
          evidenceLevel: "applied",
          normalizedSkill: "TypeScript",
        },
      ],
    });
  });

  it("normalizes empty name to '未发现信息'", () => {
    const result = projectAttachmentToResumeProfile({ ...MINIMAL_STRUCTURED, name: "   " });
    expect(result?.name).toBe("未发现信息");
  });
});
