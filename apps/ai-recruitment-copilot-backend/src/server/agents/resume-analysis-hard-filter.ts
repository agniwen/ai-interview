import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { z } from "zod";
import {
  generateStructuredWithMastraAgent,
  resumeHardFilterAgent,
  resumeScreeningEvidenceAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

import type { ResumeReview } from "@arc/shared/resume-review";
import {
  evaluateResumeScreening,
  resumeScreeningEvidenceResultSchema,
} from "@arc/shared/resume-screening";
import type {
  ResumeScreeningEvidenceResult,
  ResumeScreeningPolicy,
  ResumeScreeningResult,
  ResumeScreeningSemanticRule,
  ResumeScreeningSkillRule,
} from "@arc/shared/resume-screening";
import {
  RESUME_REVIEW_SCHEMA_VERSION,
  formatResumeReviewMarkdown,
} from "@arc/shared/resume-review";
import type { ResumeReviewGenerationResult } from "./resume-analysis-review";

const RESUME_REVIEW_SERVER_TIME_ZONE = "Asia/Shanghai";
const nonEmpty = z.string().trim().min(1);

function buildResumeReviewTimeContext(now = new Date()) {
  const formattedNow = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: RESUME_REVIEW_SERVER_TIME_ZONE,
  }).format(now);

  return [
    `当前服务端时间（${RESUME_REVIEW_SERVER_TIME_ZONE}）：${formattedNow}`,
    "时间判断规则：判断候选人的在职时长、工作年限、项目持续时间、是否仍在职、时间线是否合理时，以上述服务端时间作为“现在”；简历中的“至今”“最近”“目前”默认按该时间理解。不要使用模型训练时间或系统外部假设代替当前时间。",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Agent 0: 硬性门槛提取 + 规则引擎
// ---------------------------------------------------------------------

const HARD_FILTER_INSTRUCTIONS = `你是一名招聘门槛提取助手。从给定的在招岗位描述（JD）中，提取结构化硬性门槛。
只提取 JD 中明确写出的硬性要求（如"必须本科以上""3 年以上经验""必须掌握 React"）；JD 未提及的字段输出 null，表示不参与过滤。
不要编造 JD 中没有的要求。不要输出解释性文字，只输出 JSON 对象。

## 输出 JSON 结构
{
  "minimumEducation": "专科" | "本科" | "硕士" | "博士" | null,
  "minimumWorkYears": 数字 | null,
  "requiredSkills": ["技能名"] | null,
  "semanticRequirements": ["JD 中无法用规则匹配的语义要求，如'有从零到一建设经验''有大团队管理经验'"] | null
}

## 说明
- minimumEducation：只填 JD 明确写的最低学历要求；未提及则 null。
- minimumWorkYears：JD 写的最低工作年限数字；未提及则 null。
- requiredSkills：JD 明确标注"必须掌握""必备""精通"的技能；建议性技能不算。
- semanticRequirements：JD 中定性描述的硬性要求（无法用学历/年限/技能关键词匹配的），交给下游定性评价 Agent 在偏差扫描中覆盖。JD 无此类要求则输出空数组或 null。
- 不要输出 workLocation / languageRequirements / requiredCertifications 字段——当前简历结构化数据不支持这些维度的规则匹配。`;

const EDUCATION_LEVEL_ORDER = ["专科", "大专", "本科", "硕士", "博士"] as const;

function educationLevelRank(level: string | null | undefined): number {
  if (!level) {
    return -1;
  }
  const trimmed = level.trim();
  const idx = EDUCATION_LEVEL_ORDER.findIndex(
    (entry) => trimmed === entry || trimmed.includes(entry),
  );
  return idx === -1 ? -1 : idx;
}

const hardFilterSchema = z.object({
  minimumEducation: z.enum(["专科", "大专", "本科", "硕士", "博士"]).nullable(),
  minimumWorkYears: z.number().int().min(0).nullable(),
  requiredSkills: z.array(nonEmpty).nullable(),
  semanticRequirements: z.array(nonEmpty).nullable(),
});
type HardFilterCriteria = z.infer<typeof hardFilterSchema>;

export interface HardFilterViolation {
  field: string;
  description: string;
  impact: string;
}

function normalizeSkill(s: string): string {
  return s.trim().toLowerCase();
}

// 规则引擎：把简历与硬性门槛逐项比对，返回所有违反项。
// Rule engine: compare resume against hard criteria, return all violations.
function checkHardFilter(
  resumeProfile: ResumeProfile,
  criteria: HardFilterCriteria,
): HardFilterViolation[] {
  const violations: HardFilterViolation[] = [];

  if (criteria.minimumEducation) {
    const requiredRank = educationLevelRank(criteria.minimumEducation);
    const educations = resumeProfile.educationExperiences ?? [];
    const candidateMaxRank = Math.max(
      ...educations.map((edu) => educationLevelRank(edu.educationLevel)),
      -1,
    );
    if (candidateMaxRank >= 0 && candidateMaxRank < requiredRank) {
      violations.push({
        description: `学历不达标：岗位要求${criteria.minimumEducation}及以上`,
        field: "minimumEducation",
        impact: "硬性门槛不满足，建议淘汰",
      });
    }
  }

  if (
    criteria.minimumWorkYears !== null &&
    typeof resumeProfile.workYears === "number" &&
    resumeProfile.workYears < criteria.minimumWorkYears
  ) {
    violations.push({
      description: `经验年限不够：岗位要求${criteria.minimumWorkYears}年以上，候选人${resumeProfile.workYears}年`,
      field: "minimumWorkYears",
      impact: "硬性门槛不满足，建议淘汰",
    });
  }

  if (criteria.requiredSkills && criteria.requiredSkills.length > 0) {
    const candidateSkills = new Set([
      ...resumeProfile.skills.map(normalizeSkill),
      ...resumeProfile.projectExperiences.flatMap((p) => p.techStack.map(normalizeSkill)),
    ]);
    const missing = criteria.requiredSkills.filter(
      (skill) => !candidateSkills.has(normalizeSkill(skill)),
    );
    if (missing.length > 0) {
      violations.push({
        description: `必备技能缺失：${missing.join("、")}`,
        field: "requiredSkills",
        impact: "硬性门槛不满足，建议淘汰",
      });
    }
  }

  return violations;
}

// 硬性门槛不达标时生成的精简 reject review。
// Minimal reject review when hard filter violations are found.
export function buildHardFilterRejectReview(
  violations: HardFilterViolation[],
): ResumeReviewGenerationResult {
  const structuredReview: ResumeReview = {
    biasScan: {
      items: violations.map((v) => ({
        category: "hard_gap" as const,
        description: v.description,
        impact: v.impact,
      })),
    },
    dimensions: {
      educationBackground: { rationale: "硬性门槛不达标，未评分", score: 0 },
      experienceRelevance: { rationale: "硬性门槛不达标，未评分", score: 0 },
      potential: { rationale: "硬性门槛不达标，未评分", score: 0 },
      projectMatch: { rationale: "硬性门槛不达标，未评分", score: 0 },
      skillMatch: { rationale: "硬性门槛不达标，未评分", score: 0 },
      stability: { rationale: "硬性门槛不达标，未评分", score: 0 },
    },
    levelRecommendation: {
      level: "—",
      rationale: "未通过硬性门槛过滤",
    },
    nextStep: {
      action: "reject" as const,
      disclaimer: "以上为初步结论",
      interviewFocus: [],
      rationale: `命中 ${violations.length} 项硬性门槛不达标`,
    },
    overall: {
      baseScore: 0,
      conclusion: "候选人未通过硬性门槛过滤。",
      scoreRationale: "硬性门槛不达标，未进入语义评分阶段。",
    },
    schemaVersion: RESUME_REVIEW_SCHEMA_VERSION,
    strengths: [
      {
        evidence: null,
        impact: "未进入定性评价阶段",
        point: "硬性门槛未通过",
      },
    ],
    teamPositioning: {
      rationale: "未通过硬性门槛过滤",
      suggestion: "暂不推荐",
    },
    weaknesses: violations.map((v) => ({
      evidence: null,
      impact: v.impact,
      point: v.description,
    })),
  };
  const review = formatResumeReviewMarkdown(structuredReview).trim().slice(0, 2000);
  return { review, structuredReview };
}

export interface HardFilterResult {
  violations: HardFilterViolation[];
  semanticRequirements: string[] | null;
}

// 运行 Agent 0 提取门槛 + 规则引擎检查。
// JD 为空时跳过提取，返回 null（不过滤）。
// Run Agent 0 extraction + rule engine check.
// Returns null (no filter) when JD is absent.
export async function runResumeReviewHardFilter(
  resumeProfile: ResumeProfile,
  jobDescription: string | null | undefined,
): Promise<HardFilterResult | null> {
  if (!jobDescription?.trim()) {
    return null;
  }

  const criteria = await generateStructuredWithMastraAgent({
    agent: resumeHardFilterAgent,
    prompt: `${HARD_FILTER_INSTRUCTIONS}\n\n${buildResumeReviewTimeContext()}\n\n在招岗位描述：\n${jobDescription.trim()}`,
    retryOnInvalid: true,
    schema: hardFilterSchema,
    temperature: 0,
  });

  return {
    semanticRequirements: criteria.semanticRequirements,
    violations: checkHardFilter(resumeProfile, criteria),
  };
}

function activeAiEvidenceRules(policy: ResumeScreeningPolicy | null): {
  semanticRules: ResumeScreeningSemanticRule[];
  skillRules: ResumeScreeningSkillRule[];
} {
  if (!policy?.enabled) {
    return { semanticRules: [], skillRules: [] };
  }
  return {
    semanticRules: policy.rules.filter(
      (rule): rule is ResumeScreeningSemanticRule => rule.type === "semantic",
    ),
    skillRules: policy.rules.filter(
      (rule): rule is ResumeScreeningSkillRule => rule.type === "skill",
    ),
  };
}

function buildResumeScreeningEvidencePrompt(input: {
  resumeProfile: ResumeProfile;
  resumeText?: string | null;
  semanticRules: ResumeScreeningSemanticRule[];
  skillRules: ResumeScreeningSkillRule[];
}) {
  const resumeTextBlock = input.resumeText?.trim()
    ? `简历原文：\n${input.resumeText.trim().slice(0, 12_000)}`
    : "简历原文：（未提供，仅使用结构化简历判断）";
  return `${buildResumeReviewTimeContext()}

你只负责判断已确认筛选规则在候选人简历中的证据，不要新增规则，不要修改规则，不要给最终结论。

判断要求：
- 技能可以基于同义表达、项目技术栈、职责描述做语义判断；无法确认时输出 unknown，不要强行判不匹配。
- 语义要求必须找到明确支持证据才输出 evidence_found；没有明确证据输出 evidence_missing；信息不足输出 unknown。
- evidence.quote 只能摘录简历中的短句；若证据来自结构化字段且没有原文短句，可省略 quote。
- 所有 explanation 使用中文。

技能规则：
${JSON.stringify(input.skillRules, null, 2)}

语义规则：
${JSON.stringify(input.semanticRules, null, 2)}

候选人结构化简历：
${JSON.stringify(input.resumeProfile, null, 2)}

${resumeTextBlock}`;
}

export async function generateResumeScreeningEvidence(input: {
  resumeProfile: ResumeProfile;
  resumeText?: string | null;
  semanticRules: ResumeScreeningSemanticRule[];
  skillRules: ResumeScreeningSkillRule[];
}): Promise<ResumeScreeningEvidenceResult> {
  if (input.skillRules.length === 0 && input.semanticRules.length === 0) {
    return {};
  }
  return await generateStructuredWithMastraAgent({
    agent: resumeScreeningEvidenceAgent,
    prompt: buildResumeScreeningEvidencePrompt(input),
    retryOnInvalid: true,
    schema: resumeScreeningEvidenceResultSchema,
    temperature: 0,
  });
}

export async function generateResumeScreeningResult(input: {
  policy: ResumeScreeningPolicy | null;
  resumeProfile: ResumeProfile;
  resumeText?: string | null;
}): Promise<ResumeScreeningResult> {
  const { semanticRules, skillRules } = activeAiEvidenceRules(input.policy);
  const evidence =
    semanticRules.length > 0 || skillRules.length > 0
      ? await generateResumeScreeningEvidence({
          resumeProfile: input.resumeProfile,
          resumeText: input.resumeText,
          semanticRules,
          skillRules,
        })
      : undefined;
  return evaluateResumeScreening({
    evidence,
    policy: input.policy,
    resumeProfile: input.resumeProfile,
  });
}
