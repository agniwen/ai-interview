import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import { evaluateResumeScreening } from "../resume-screening";
import type {
  ResumeScreeningEvidenceResult,
  ResumeScreeningPolicy,
  ResumeScreeningRecommendation,
  ResumeScreeningRuleStatus,
} from "../resume-screening";

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
  gender: null,
  name: "合成候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: ["某大学"],
  skills: ["React.js", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 4,
};

interface SyntheticCase {
  evidence?: ResumeScreeningEvidenceResult;
  expectedRecommendation: ResumeScreeningRecommendation;
  expectedStatus?: ResumeScreeningRuleStatus;
  name: string;
  policy: ResumeScreeningPolicy;
  profile?: ResumeProfile;
}

const policy = (rules: ResumeScreeningPolicy["rules"], enabled = true): ResumeScreeningPolicy => ({
  enabled,
  rules,
  version: 1,
});

const educationRule = (level: "专科" | "本科" | "硕士") => ({
  field: "minimumEducation" as const,
  id: "education",
  level,
  severity: "blocking" as const,
  type: "field" as const,
});

const workYearsRule = (years: number) => ({
  field: "minimumWorkYears" as const,
  id: "work-years",
  severity: "blocking" as const,
  type: "field" as const,
  years,
});

const fieldCases: SyntheticCase[] = [
  {
    expectedRecommendation: "flag",
    expectedStatus: "unknown",
    name: "学历缺失时人工核实，不误判失败",
    policy: policy([educationRule("本科")]),
    profile: { ...PROFILE, educationExperiences: [] },
  },
  {
    expectedRecommendation: "hold",
    expectedStatus: "fail",
    name: "学历明确低于 blocking 门槛时暂缓",
    policy: policy([educationRule("硕士")]),
  },
  {
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "学历恰好达到门槛时通过",
    policy: policy([educationRule("本科")]),
  },
  {
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "学历高于门槛时通过",
    policy: policy([educationRule("专科")]),
  },
  {
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "大专与专科按同一层级处理",
    policy: policy([educationRule("专科")]),
    profile: {
      ...PROFILE,
      educationExperiences: [{ ...PROFILE.educationExperiences[0], educationLevel: "大专" }],
    },
  },
  {
    expectedRecommendation: "flag",
    expectedStatus: "unknown",
    name: "工作年限缺失时人工核实",
    policy: policy([workYearsRule(4)]),
    profile: { ...PROFILE, workYears: null },
  },
  {
    expectedRecommendation: "hold",
    expectedStatus: "fail",
    name: "工作年限明确不足时暂缓",
    policy: policy([workYearsRule(5)]),
  },
  {
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "工作年限边界相等时通过",
    policy: policy([workYearsRule(4)]),
  },
];

const skillRule = (
  matchMode: { count: number; type: "at_least" } | { type: "all" },
  severity: "blocking" | "info" | "warning" = "blocking",
) => ({
  id: "skills",
  matchMode,
  requiredSkills: ["React", "TypeScript", "GraphQL"],
  severity,
  type: "skill" as const,
});

function toSkillEvidenceStatus(status: ResumeScreeningRuleStatus) {
  if (status === "pass") {
    return "matched" as const;
  }
  if (status === "fail") {
    return "not_found" as const;
  }
  return "unknown" as const;
}

const skillEvidence = (
  statuses: [ResumeScreeningRuleStatus, ResumeScreeningRuleStatus, ResumeScreeningRuleStatus],
): ResumeScreeningEvidenceResult => ({
  skillResults: ["react", "TypeScript", "GraphQL"].map((skill, index) => ({
    evidence: [],
    skill,
    status: toSkillEvidenceStatus(statuses[index] ?? "unknown"),
  })),
});

const skillCases: SyntheticCase[] = [
  {
    evidence: skillEvidence(["pass", "pass", "pass"]),
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "全部技能匹配时通过",
    policy: policy([skillRule({ type: "all" })]),
  },
  {
    evidence: skillEvidence(["pass", "pass", "pass"]),
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "技能证据按大小写不敏感匹配",
    policy: policy([skillRule({ count: 2, type: "at_least" })]),
  },
  {
    evidence: skillEvidence(["pass", "pass", "fail"]),
    expectedRecommendation: "hold",
    expectedStatus: "fail",
    name: "全部技能要求存在明确缺项时暂缓",
    policy: policy([skillRule({ type: "all" })]),
  },
  {
    evidence: skillEvidence(["pass", "pass", "unknown"]),
    expectedRecommendation: "flag",
    expectedStatus: "unknown",
    name: "全部技能要求存在未知项时人工核实",
    policy: policy([skillRule({ type: "all" })]),
  },
  {
    evidence: skillEvidence(["pass", "pass", "fail"]),
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "至少两项要求达到阈值时通过",
    policy: policy([skillRule({ count: 2, type: "at_least" })]),
  },
  {
    evidence: skillEvidence(["pass", "unknown", "fail"]),
    expectedRecommendation: "flag",
    expectedStatus: "unknown",
    name: "未知技能可能达到至少项阈值时人工核实",
    policy: policy([skillRule({ count: 2, type: "at_least" })]),
  },
  {
    evidence: skillEvidence(["pass", "fail", "fail"]),
    expectedRecommendation: "hold",
    expectedStatus: "fail",
    name: "已知技能不可能达到至少项阈值时暂缓",
    policy: policy([skillRule({ count: 2, type: "at_least" })]),
  },
];

const semanticRule = (severity: "blocking" | "info" | "warning") => ({
  id: "semantic",
  requirement: "有从零到一建设经验",
  severity,
  type: "semantic" as const,
});

const semanticEvidence = (
  status: "evidence_found" | "evidence_missing" | "unknown",
): ResumeScreeningEvidenceResult => ({
  semanticResults: [{ evidence: [], ruleId: "semantic", status }],
});

const semanticCases: SyntheticCase[] = [
  {
    evidence: semanticEvidence("evidence_found"),
    expectedRecommendation: "pass",
    expectedStatus: "pass",
    name: "语义要求有明确证据时通过",
    policy: policy([semanticRule("blocking")]),
  },
  {
    evidence: semanticEvidence("evidence_missing"),
    expectedRecommendation: "hold",
    expectedStatus: "fail",
    name: "blocking 语义要求明确无证据时暂缓",
    policy: policy([semanticRule("blocking")]),
  },
  {
    evidence: semanticEvidence("unknown"),
    expectedRecommendation: "flag",
    expectedStatus: "unknown",
    name: "语义要求信息不足时人工核实",
    policy: policy([semanticRule("blocking")]),
  },
  {
    evidence: semanticEvidence("evidence_missing"),
    expectedRecommendation: "flag",
    expectedStatus: "fail",
    name: "warning 失败只标记人工核实",
    policy: policy([semanticRule("warning")]),
  },
  {
    evidence: semanticEvidence("evidence_missing"),
    expectedRecommendation: "pass",
    expectedStatus: "fail",
    name: "info 失败不阻止通过",
    policy: policy([semanticRule("info")]),
  },
  {
    evidence: {
      ...semanticEvidence("evidence_missing"),
      skillResults: skillEvidence(["fail", "fail", "fail"]).skillResults,
    },
    expectedRecommendation: "hold",
    name: "blocking 失败优先于其他规则结果",
    policy: policy([semanticRule("warning"), skillRule({ type: "all" })]),
  },
];

const policyCases: SyntheticCase[] = [
  {
    expectedRecommendation: "pass",
    name: "禁用策略时不执行规则",
    policy: policy([educationRule("硕士")], false),
  },
  {
    expectedRecommendation: "pass",
    name: "空策略直接通过",
    policy: policy([]),
  },
  {
    expectedRecommendation: "pass",
    name: "学历不限规则视为空策略",
    policy: policy([
      {
        field: "minimumEducation",
        id: "education-none",
        level: "none",
        severity: "blocking",
        type: "field",
      },
    ]),
  },
];

describe.each([...fieldCases, ...skillCases, ...semanticCases, ...policyCases])(
  "合成筛选案例：$name",
  (testCase) => {
    it("保持硬门槛安全契约", () => {
      const result = evaluateResumeScreening({
        evidence: testCase.evidence,
        policy: testCase.policy,
        resumeProfile: testCase.profile ?? PROFILE,
      });

      expect(result.recommendation).toBe(testCase.expectedRecommendation);
      if (testCase.expectedStatus) {
        expect(result.ruleResults[0]?.status).toBe(testCase.expectedStatus);
      }
    });
  },
);
