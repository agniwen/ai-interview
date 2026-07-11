import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

export const resumeScreeningRecommendationSchema = z.enum(["pass", "flag", "hold"]);
export const resumeScreeningRuleSeveritySchema = z.enum(["info", "warning", "blocking"]);
export const resumeScreeningRuleStatusSchema = z.enum(["pass", "fail", "unknown"]);

export const resumeScreeningEvidenceSchema = z.object({
  explanation: nonEmptyStringSchema,
  fieldPath: z.string().trim().optional(),
  quote: z.string().trim().optional(),
  source: z.enum(["resume_profile", "resume_text", "ai_inference", "manual"]),
});

const baseRuleSchema = z.object({
  id: nonEmptyStringSchema,
  severity: resumeScreeningRuleSeveritySchema,
});

export const resumeScreeningFieldRuleSchema = z.union([
  baseRuleSchema.extend({
    field: z.literal("minimumEducation"),
    level: z.enum(["none", "专科", "本科", "硕士", "博士"]),
    type: z.literal("field"),
  }),
  baseRuleSchema.extend({
    field: z.literal("minimumWorkYears"),
    type: z.literal("field"),
    years: z.number().int().min(0),
  }),
]);

export const resumeScreeningSkillRuleSchema = baseRuleSchema.extend({
  matchMode: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ count: z.number().int().min(1), type: z.literal("at_least") }),
  ]),
  requiredSkills: z.array(nonEmptyStringSchema).min(1),
  type: z.literal("skill"),
});

export const resumeScreeningSemanticRuleSchema = baseRuleSchema.extend({
  requirement: nonEmptyStringSchema,
  type: z.literal("semantic"),
});

export const resumeScreeningRuleSchema = z.union([
  resumeScreeningFieldRuleSchema,
  resumeScreeningSkillRuleSchema,
  resumeScreeningSemanticRuleSchema,
]);

export const resumeScreeningPolicySchema = z.object({
  enabled: z.boolean(),
  rules: z.array(resumeScreeningRuleSchema),
  version: z.number().int().min(1),
});

export const resumeScreeningSkillEvidenceResultSchema = z.object({
  evidence: z.array(resumeScreeningEvidenceSchema),
  skill: nonEmptyStringSchema,
  status: z.enum(["matched", "not_found", "unknown"]),
});

export const resumeScreeningSemanticEvidenceResultSchema = z.object({
  evidence: z.array(resumeScreeningEvidenceSchema),
  ruleId: nonEmptyStringSchema,
  status: z.enum(["evidence_found", "evidence_missing", "unknown"]),
});

export const resumeScreeningEvidenceResultSchema = z.object({
  semanticResults: z.array(resumeScreeningSemanticEvidenceResultSchema).optional(),
  skillResults: z.array(resumeScreeningSkillEvidenceResultSchema).optional(),
});

export const resumeScreeningRuleResultSchema = z.object({
  evidence: z.array(resumeScreeningEvidenceSchema),
  label: nonEmptyStringSchema,
  reason: nonEmptyStringSchema,
  ruleId: nonEmptyStringSchema,
  severity: resumeScreeningRuleSeveritySchema,
  status: resumeScreeningRuleStatusSchema,
  type: z.enum(["field", "skill", "semantic"]),
});

export const resumeScreeningResultSchema = z.object({
  policyEmpty: z.boolean(),
  policyEnabled: z.boolean(),
  policyHash: z.string().nullable(),
  policyVersion: z.number().int().min(1).nullable(),
  recommendation: resumeScreeningRecommendationSchema,
  ruleResults: z.array(resumeScreeningRuleResultSchema),
});

export type ResumeScreeningRecommendation = z.infer<typeof resumeScreeningRecommendationSchema>;
export type ResumeScreeningRuleSeverity = z.infer<typeof resumeScreeningRuleSeveritySchema>;
export type ResumeScreeningRuleStatus = z.infer<typeof resumeScreeningRuleStatusSchema>;
export type ResumeScreeningEvidence = z.infer<typeof resumeScreeningEvidenceSchema>;
export type ResumeScreeningFieldRule = z.infer<typeof resumeScreeningFieldRuleSchema>;
export type ResumeScreeningSkillRule = z.infer<typeof resumeScreeningSkillRuleSchema>;
export type ResumeScreeningSemanticRule = z.infer<typeof resumeScreeningSemanticRuleSchema>;
export type ResumeScreeningRule = z.infer<typeof resumeScreeningRuleSchema>;
export type ResumeScreeningPolicy = z.infer<typeof resumeScreeningPolicySchema>;
export type ResumeScreeningEvidenceResult = z.infer<typeof resumeScreeningEvidenceResultSchema>;
export type ResumeScreeningRuleResult = z.infer<typeof resumeScreeningRuleResultSchema>;
export type ResumeScreeningResult = z.infer<typeof resumeScreeningResultSchema>;

export function createDefaultResumeScreeningPolicy(): ResumeScreeningPolicy {
  return {
    enabled: false,
    rules: [],
    version: 1,
  };
}

/**
 * 从简历筛选策略抽取「岗位必备技能」清单，供关键词高亮的 `extraSkills` 使用。
 * 只取 `type:"skill"` 规则的 `requiredSkills`，扁平化并按大小写不敏感去重（忽略首尾空白）。
 * 可直接传入 DB 里的原始 jsonb（`Record`/`unknown`）：内部 safeParse，无策略/解析失败返回 `[]`。
 */
export function deriveJdRequiredSkills(policy: unknown): string[] {
  const parsed = resumeScreeningPolicySchema.safeParse(policy);
  if (!parsed.success) {
    return [];
  }
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const rule of parsed.data.rules) {
    if (rule.type !== "skill") {
      continue;
    }
    for (const raw of rule.requiredSkills) {
      const skill = raw.trim();
      if (!skill) {
        continue;
      }
      const key = skill.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      skills.push(skill);
    }
  }
  return skills;
}

const EDUCATION_LEVEL_ORDER = ["专科", "大专", "本科", "硕士", "博士"] as const;

function entryToCanonicalRank(level: (typeof EDUCATION_LEVEL_ORDER)[number]) {
  if (level === "大专") {
    return 0;
  }
  return ["专科", "本科", "硕士", "博士"].indexOf(level);
}

function educationLevelRank(level: string | null | undefined): number {
  if (!level) {
    return -1;
  }
  const trimmed = level.trim();
  const idx = EDUCATION_LEVEL_ORDER.findIndex(
    (entry) => trimmed === entry || trimmed.includes(entry),
  );
  if (idx === -1) {
    return -1;
  }
  return entryToCanonicalRank(EDUCATION_LEVEL_ORDER[idx]);
}

function ruleLabel(rule: ResumeScreeningRule): string {
  if (rule.type === "field" && rule.field === "minimumEducation") {
    return `最低学历：${rule.level === "none" ? "不限" : rule.level}`;
  }
  if (rule.type === "field" && rule.field === "minimumWorkYears") {
    return `最低工作年限：${rule.years} 年`;
  }
  if (rule.type === "skill") {
    return `必备技能：${rule.requiredSkills.join("、")}`;
  }
  return rule.requirement;
}

function makeEvidence(input: ResumeScreeningEvidence): ResumeScreeningEvidence[] {
  return [input];
}

function evaluateFieldRule(
  rule: ResumeScreeningFieldRule,
  resumeProfile: ResumeProfile,
): ResumeScreeningRuleResult {
  if (rule.field === "minimumEducation") {
    if (rule.level === "none") {
      return {
        evidence: [],
        label: ruleLabel(rule),
        reason: "未设置最低学历要求。",
        ruleId: rule.id,
        severity: rule.severity,
        status: "pass",
        type: "field",
      };
    }
    const requiredRank = educationLevelRank(rule.level);
    const educations = resumeProfile.educationExperiences ?? [];
    const candidateRank = Math.max(
      ...educations.map((edu) => educationLevelRank(edu.educationLevel)),
      -1,
    );
    if (candidateRank < 0) {
      return {
        evidence: [],
        label: ruleLabel(rule),
        reason: "简历未明确学历层次，需人工核实。",
        ruleId: rule.id,
        severity: rule.severity,
        status: "unknown",
        type: "field",
      };
    }
    return {
      evidence: makeEvidence({
        explanation: "来自结构化简历教育经历的学历层次。",
        fieldPath: "educationExperiences",
        source: "resume_profile",
      }),
      label: ruleLabel(rule),
      reason:
        candidateRank >= requiredRank
          ? `候选人学历满足${rule.level}及以上要求。`
          : `候选人学历未满足${rule.level}及以上要求。`,
      ruleId: rule.id,
      severity: rule.severity,
      status: candidateRank >= requiredRank ? "pass" : "fail",
      type: "field",
    };
  }

  if (typeof resumeProfile.workYears !== "number") {
    return {
      evidence: [],
      label: ruleLabel(rule),
      reason: "简历未明确工作年限，需人工核实。",
      ruleId: rule.id,
      severity: rule.severity,
      status: "unknown",
      type: "field",
    };
  }

  return {
    evidence: makeEvidence({
      explanation: `结构化简历工作年限为 ${resumeProfile.workYears} 年。`,
      fieldPath: "workYears",
      source: "resume_profile",
    }),
    label: ruleLabel(rule),
    reason:
      resumeProfile.workYears >= rule.years
        ? `候选人工作年限满足 ${rule.years} 年要求。`
        : `候选人工作年限未满足 ${rule.years} 年要求。`,
    ruleId: rule.id,
    severity: rule.severity,
    status: resumeProfile.workYears >= rule.years ? "pass" : "fail",
    type: "field",
  };
}

function evaluateSkillRule(
  rule: ResumeScreeningSkillRule,
  evidence: ResumeScreeningEvidenceResult,
): ResumeScreeningRuleResult {
  const bySkill = new Map(
    (evidence.skillResults ?? []).map((result) => [result.skill.trim().toLowerCase(), result]),
  );
  const results = rule.requiredSkills.map(
    (skill) =>
      bySkill.get(skill.trim().toLowerCase()) ?? {
        evidence: [],
        skill,
        status: "unknown" as const,
      },
  );
  const matchedCount = results.filter((result) => result.status === "matched").length;
  const unknownCount = results.filter((result) => result.status === "unknown").length;
  const requiredCount =
    rule.matchMode.type === "all" ? rule.requiredSkills.length : rule.matchMode.count;
  let status: ResumeScreeningRuleStatus = "fail";
  if (matchedCount >= requiredCount) {
    status = "pass";
  } else if (matchedCount + unknownCount >= requiredCount) {
    status = "unknown";
  }

  return {
    evidence: results.flatMap((result) => result.evidence),
    label: ruleLabel(rule),
    reason:
      rule.matchMode.type === "all"
        ? `已匹配 ${matchedCount}/${rule.requiredSkills.length} 项技能，要求全部满足。`
        : `已匹配 ${matchedCount}/${rule.requiredSkills.length} 项技能，达到至少 ${rule.matchMode.count} 项要求。`,
    ruleId: rule.id,
    severity: rule.severity,
    status,
    type: "skill",
  };
}

function evaluateSemanticRule(
  rule: ResumeScreeningSemanticRule,
  evidence: ResumeScreeningEvidenceResult,
): ResumeScreeningRuleResult {
  const result = (evidence.semanticResults ?? []).find((item) => item.ruleId === rule.id);
  if (!result || result.status === "unknown") {
    return {
      evidence: result?.evidence ?? [],
      label: ruleLabel(rule),
      reason: "未能确认该语义要求的证据，需人工核实。",
      ruleId: rule.id,
      severity: rule.severity,
      status: "unknown",
      type: "semantic",
    };
  }
  return {
    evidence: result.evidence,
    label: ruleLabel(rule),
    reason:
      result.status === "evidence_found"
        ? "简历中发现该语义要求的支持证据。"
        : "简历中未发现该语义要求的明确证据。",
    ruleId: rule.id,
    severity: rule.severity,
    status: result.status === "evidence_found" ? "pass" : "fail",
    type: "semantic",
  };
}

function aggregateRecommendation(
  ruleResults: ResumeScreeningRuleResult[],
): ResumeScreeningRecommendation {
  let recommendation: ResumeScreeningRecommendation = "pass";
  for (const result of ruleResults) {
    if (result.status === "pass" || result.severity === "info") {
      continue;
    }
    if (result.status === "unknown") {
      if (recommendation === "pass") {
        recommendation = "flag";
      }
      continue;
    }
    if (result.severity === "blocking") {
      return "hold";
    }
    if (result.severity === "warning") {
      recommendation = "flag";
    }
  }
  return recommendation;
}

function canonicalizePolicy(policy: ResumeScreeningPolicy) {
  const rules = policy.enabled
    ? policy.rules
        .filter(
          (rule) =>
            !(rule.type === "field" && rule.field === "minimumEducation" && rule.level === "none"),
        )
        .map((rule) => {
          if (rule.type === "field" && rule.field === "minimumEducation") {
            return {
              field: rule.field,
              level: rule.level,
              severity: rule.severity,
              type: rule.type,
            };
          }
          if (rule.type === "field" && rule.field === "minimumWorkYears") {
            return {
              field: rule.field,
              severity: rule.severity,
              type: rule.type,
              years: rule.years,
            };
          }
          if (rule.type === "skill") {
            return {
              matchMode: rule.matchMode,
              requiredSkills: rule.requiredSkills.map((skill) => skill.trim()).toSorted(),
              severity: rule.severity,
              type: rule.type,
            };
          }
          return {
            requirement: rule.requirement.trim(),
            severity: rule.severity,
            type: rule.type,
          };
        })
    : [];
  return {
    enabled: policy.enabled,
    rules: rules.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}

export function computeResumeScreeningPolicyHash(policy: ResumeScreeningPolicy): string {
  const value = JSON.stringify(canonicalizePolicy(policy));
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 16_777_619 + (value.codePointAt(i) ?? 0)) % 4_294_967_291;
  }
  return Math.trunc(hash).toString(16).padStart(8, "0");
}

export function evaluateResumeScreening(input: {
  evidence?: ResumeScreeningEvidenceResult;
  policy: ResumeScreeningPolicy | null;
  resumeProfile: ResumeProfile;
}): ResumeScreeningResult {
  const parsedPolicy = input.policy ? resumeScreeningPolicySchema.parse(input.policy) : null;
  const policyEnabled = Boolean(parsedPolicy?.enabled);
  const activeRules =
    parsedPolicy?.enabled === true
      ? parsedPolicy.rules.filter(
          (rule) =>
            !(rule.type === "field" && rule.field === "minimumEducation" && rule.level === "none"),
        )
      : [];
  const policyEmpty = activeRules.length === 0;

  if (!(parsedPolicy && policyEnabled) || policyEmpty) {
    return {
      policyEmpty: true,
      policyEnabled,
      policyHash: parsedPolicy ? computeResumeScreeningPolicyHash(parsedPolicy) : null,
      policyVersion: parsedPolicy?.version ?? null,
      recommendation: "pass",
      ruleResults: [],
    };
  }

  const evidence = resumeScreeningEvidenceResultSchema.parse(input.evidence ?? {});
  const ruleResults = activeRules.map((rule) => {
    if (rule.type === "field") {
      return evaluateFieldRule(rule, input.resumeProfile);
    }
    if (rule.type === "skill") {
      return evaluateSkillRule(rule, evidence);
    }
    return evaluateSemanticRule(rule, evidence);
  });

  return {
    policyEmpty: false,
    policyEnabled,
    policyHash: computeResumeScreeningPolicyHash(parsedPolicy),
    policyVersion: parsedPolicy.version,
    recommendation: aggregateRecommendation(ruleResults),
    ruleResults,
  };
}
