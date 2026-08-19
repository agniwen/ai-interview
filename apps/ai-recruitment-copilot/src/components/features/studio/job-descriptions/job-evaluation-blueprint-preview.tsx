import type { JobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type {
  JobDescriptionDeductionRules,
  StructuredResumeRuleId,
} from "@arc/db-schema/job-description-structured-config";
import { structuredResumeRuleIdSchema } from "@arc/db-schema/job-description-structured-config";
import {
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import { JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT } from "./job-description-form-values";
import { JobDescriptionMarkdownSurface } from "./job-description-markdown-surface";

type Dimension = (typeof STRUCTURED_RESUME_DIMENSIONS)[number];

const DIMENSION_LABELS = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
} satisfies Record<Dimension, string>;

const RULE_LABELS = {
  "education.below_tier": "学历每低于门槛一档",
  "education.major_unrelated": "专业与岗位无关",
  "experience.fragmented": "相关经验碎片化或多次转行断档",
  "experience.industry_unrelated": "行业完全不匹配",
  "experience.missing_year": "相关经验每缺少 1 年",
  "potential.illogical_switches": "无逻辑频繁跨行",
  "potential.no_growth_two_years": "近 2 年无成长记录",
  "potential.unexplained_gap_over_six_months": "超过 6 个月空档且无合理解释",
  "project.edge_participation": "仅边缘参与相关项目",
  "project.no_relevant_project": "无相关项目",
  "project.old_relevant_project": "最近相关项目距今超过 3 年",
  "project.scale_low": "项目规模或复杂度不足",
  "skill.missing_auxiliary": "每缺失 1 项辅助技能",
  "skill.missing_core": "每缺失 1 项核心技能",
  "skill.no_related_skill": "无任何相关技能",
  "skill.shallow": "每项技能仅浅层了解",
  "stability.frequent_unrelated_industries": "频繁跨完全无关行业",
  "stability.gap_over_six_months": "空档超过 6 个月且无解释",
  "stability.gap_three_to_six_months": "空档 3～6 个月且无解释",
  "stability.short_tenure": "每段任职不足 3 个月",
  "stability.three_changes_one_year": "1 年内跳槽至少 3 次",
  "stability.two_changes_one_year": "1 年内跳槽 2 次",
  "stability.two_changes_two_years": "近 2 年跳槽 2 次",
} satisfies Record<StructuredResumeRuleId, string>;

const DEGREE_LABELS = {
  associate: "大专及以上",
  bachelor: "本科及以上",
  doctorate: "博士",
  master: "硕士及以上",
} as const;

function experienceValue(value: JobEvaluationRuleDraft["requiredRelevantExperience"]): string {
  return value ? `${value.years} 年｜${value.scopeDescription}` : "未设置";
}

function educationValue(value: JobEvaluationRuleDraft["educationExpectation"]): string {
  if (!value) {
    return "未设置";
  }
  const degree = value.degreeLevel ? DEGREE_LABELS[value.degreeLevel] : "";
  return [degree, value.majorExpectation].filter(Boolean).join("，") || "未设置";
}

function serializeList(label: string, values: string[]): string[] {
  return [label, ...values.map((value) => `- ${value}`)];
}

function serializeSkillGroups(
  label: string,
  expectationType: "auxiliary" | "core",
  ruleDraft: JobEvaluationRuleDraft,
): string[] {
  const groups = ruleDraft.skillRequirementGroups.filter(
    (group) => group.expectationType === expectationType,
  );
  return [
    label,
    ...groups.map((group) => {
      if (group.skills.length === 1) {
        return `- ${group.skills[0]}`;
      }
      const modeLabel = group.satisfactionMode === "any" ? "任一掌握" : "全部掌握";
      return `- ${modeLabel}：${group.skills.join("、")}`;
    }),
  ];
}

function serializeDeductionRule(
  ruleId: StructuredResumeRuleId,
  config: JobDescriptionDeductionRules[StructuredResumeRuleId],
): string {
  if (!config.enabled) {
    return `- ${RULE_LABELS[ruleId]}：关闭`;
  }
  if (STRUCTURED_RESUME_DEDUCTION_CATALOG[ruleId].directZero) {
    return `- ${RULE_LABELS[ruleId]}：启用（命中后该维度为 0 分）`;
  }
  return `- ${RULE_LABELS[ruleId]}：-${config.points} 分`;
}

export function serializeEvaluationRules({
  deductionRules,
  ruleDraft,
}: {
  deductionRules: JobDescriptionDeductionRules;
  ruleDraft: JobEvaluationRuleDraft;
}): string {
  const lines: string[] = [];
  for (const dimension of STRUCTURED_RESUME_DIMENSIONS) {
    if (lines.length) {
      lines.push("");
    }
    lines.push(`【${DIMENSION_LABELS[dimension]}】`);
    if (dimension === "skillMatch") {
      lines.push(...serializeSkillGroups("核心技能：", "core", ruleDraft));
      lines.push(...serializeSkillGroups("辅助技能：", "auxiliary", ruleDraft));
    }
    if (dimension === "experienceRelevance") {
      lines.push(`相关经验要求：${experienceValue(ruleDraft.requiredRelevantExperience)}`);
    }
    if (dimension === "educationBackground") {
      lines.push(`学历与背景要求：${educationValue(ruleDraft.educationExpectation)}`);
    }
    if (ruleDraft.dimensionExpectations[dimension].length > 0) {
      lines.push(...serializeList("岗位判断依据：", ruleDraft.dimensionExpectations[dimension]));
    }
    lines.push("计分规则：");
    for (const [rawRuleId, rule] of Object.entries(STRUCTURED_RESUME_DEDUCTION_CATALOG)) {
      const ruleId = structuredResumeRuleIdSchema.safeParse(rawRuleId);
      if (ruleId.success && rule.dimension === dimension) {
        lines.push(serializeDeductionRule(ruleId.data, deductionRules[ruleId.data]));
      }
    }
  }
  return lines.join("\n");
}

export function JobEvaluationBlueprintPreview({
  className,
  deductionRules,
  height = JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT,
  ruleDraft,
}: {
  className?: string;
  deductionRules: JobDescriptionDeductionRules;
  height?: number | null;
  ruleDraft: JobEvaluationRuleDraft;
}) {
  return (
    <JobDescriptionMarkdownSurface
      aria-label="完整评分规则"
      className={className}
      content={serializeEvaluationRules({ deductionRules, ruleDraft })}
      height={height}
    />
  );
}
