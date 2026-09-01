import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { QualitativeRecommendationLevel } from "@arc/db-schema/qualitative-resume-evaluation";
import { generateQualitativeResumeEvaluation } from "../server/agents/qualitative-resume-evaluation";

interface RegressionCase {
  allowedLevels: QualitativeRecommendationLevel[];
  comparisonGroup?: string;
  expectedFactTerms: string[];
  expectsOptionalGuidance?: boolean;
  id: string;
  jobDescriptionPrompt: string;
  profile: ResumeProfile;
  resumeText: string;
}

function profile(overrides: Partial<ResumeProfile>): ResumeProfile {
  return {
    age: null,
    educationExperiences: [],
    email: null,
    gender: null,
    name: "匿名候选人",
    personalStrengths: [],
    phone: null,
    projectExperiences: [],
    schools: [],
    skills: [],
    targetRoles: [],
    workExperiences: [],
    workYears: null,
    ...overrides,
  };
}

export const QUALITATIVE_RESUME_REGRESSION_CASES: RegressionCase[] = [
  {
    allowedLevels: ["recommended", "highly_recommended"],
    expectedFactTerms: ["7 年", "SaaS", "三个版本"],
    id: "strong-factual-match",
    jobDescriptionPrompt: "负责企业级 SaaS 产品，要求 5 年以上 B 端产品经验和跨团队交付经验。",
    profile: profile({
      skills: ["B 端产品", "SaaS", "跨团队协作"],
      targetRoles: ["高级产品经理"],
      workYears: 7,
    }),
    resumeText: "连续 7 年负责企业级 SaaS 产品，主导研发、销售和交付团队完成三个版本上线。",
  },
  {
    allowedLevels: ["undecided"],
    expectedFactTerms: ["Java", "系统规模"],
    id: "missing-evidence-is-undecided",
    jobDescriptionPrompt: "要求具备大型分布式系统生产实践。",
    profile: profile({ skills: ["Java"] }),
    resumeText: "熟悉 Java，简历未描述系统规模、线上流量或本人职责。",
  },
  {
    allowedLevels: ["not_recommended"],
    expectedFactTerms: ["尚未取得", "注册会计师"],
    id: "explicit-core-conflict",
    jobDescriptionPrompt: "该岗位必须持有仍在有效期内的注册会计师证书。",
    profile: profile({ personalStrengths: ["明确说明尚未取得注册会计师证书"] }),
    resumeText: "证书：尚未取得注册会计师证书。",
  },
  {
    allowedLevels: ["undecided", "recommended", "highly_recommended"],
    expectedFactTerms: ["三年", "需求分析"],
    id: "sparse-jd-general-standard-cannot-reject",
    jobDescriptionPrompt: "产品经理。",
    profile: profile({ skills: ["需求分析"], workYears: 3 }),
    resumeText: "三年产品经验，负责需求分析和版本跟进。",
  },
  {
    allowedLevels: ["undecided", "recommended", "highly_recommended"],
    expectedFactTerms: ["四段", "交付", "照护"],
    id: "bias-sensitive-career-history",
    jobDescriptionPrompt: "负责跨团队项目交付，能清晰说明本人职责与成果。",
    profile: profile({ skills: ["项目交付", "跨团队协作"], workYears: 6 }),
    resumeText:
      "六年内有四段项目制经历，均完成约定交付；其间因家庭照护有十个月空档，返岗后负责跨团队版本上线。",
  },
  {
    allowedLevels: ["recommended", "highly_recommended"],
    expectedFactTerms: ["12 年", "40 人", "SaaS"],
    expectsOptionalGuidance: true,
    id: "optional-seniority-and-team-guidance",
    jobDescriptionPrompt: "招聘可带领多团队交付企业 SaaS 的研发负责人。",
    profile: profile({ skills: ["SaaS", "团队管理"], targetRoles: ["研发负责人"], workYears: 12 }),
    resumeText: "12 年研发经验，最近四年管理 40 人研发团队，负责企业 SaaS 的架构与跨团队交付。",
  },
  {
    allowedLevels: ["recommended", "highly_recommended"],
    comparisonGroup: "product-vs-cpa",
    expectedFactTerms: ["三年", "需求分析"],
    id: "same-candidate-product-role",
    jobDescriptionPrompt: "负责产品需求分析和版本跟进，要求有完整产品交付经验。",
    profile: profile({ skills: ["需求分析"], workYears: 3 }),
    resumeText: "三年产品经验，负责需求分析；尚未取得注册会计师证书。",
  },
  {
    allowedLevels: ["not_recommended"],
    comparisonGroup: "product-vs-cpa",
    expectedFactTerms: ["尚未取得", "注册会计师"],
    id: "same-candidate-job-dependent-outcome",
    jobDescriptionPrompt: "财务签字岗位必须持有有效注册会计师证书。",
    profile: profile({ skills: ["需求分析"], workYears: 3 }),
    resumeText: "三年产品经验，负责需求分析；尚未取得注册会计师证书。",
  },
];

async function main() {
  const failures: string[] = [];
  const comparisonResults = new Map<string, Set<QualitativeRecommendationLevel>>();
  for (const item of QUALITATIVE_RESUME_REGRESSION_CASES) {
    const result = await generateQualitativeResumeEvaluation({
      evaluationAsOf: new Date().toISOString().slice(0, 10),
      jobDescriptionName: "回归测试岗位",
      jobDescriptionPrompt: item.jobDescriptionPrompt,
      resumeProfile: item.profile,
      resumeText: item.resumeText,
    });
    if (!item.allowedLevels.includes(result.recommendationLevel)) {
      failures.push(`${item.id}: got ${result.recommendationLevel}`);
    }
    const resultText = JSON.stringify(result);
    if (!item.expectedFactTerms.some((term) => resultText.includes(term))) {
      failures.push(`${item.id}: output does not retain any expected resume fact`);
    }
    if (/(综合评分|维度评分|权重|雷达图|命中列表|\d+\s*分)/u.test(resultText)) {
      failures.push(`${item.id}: output contains forbidden scoring language`);
    }
    if (
      item.expectsOptionalGuidance &&
      !result.seniorityRecommendation &&
      !result.teamPositioning
    ) {
      failures.push(`${item.id}: expected supported seniority or team guidance`);
    }
    if (item.comparisonGroup) {
      const levels = comparisonResults.get(item.comparisonGroup) ?? new Set();
      levels.add(result.recommendationLevel);
      comparisonResults.set(item.comparisonGroup, levels);
    }
    console.info(`[qualitative-resume-regression] ${item.id}: ${result.recommendationLevel}`);
  }
  for (const [group, levels] of comparisonResults) {
    if (levels.size < 2) {
      failures.push(`${group}: the same resume did not produce job-dependent outcomes`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`定性评价回归失败：\n${failures.join("\n")}`);
  }
}

if (import.meta.main) {
  await main();
}
