import type { JobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import type {
  JobDescriptionDeductionRules,
  StructuredResumeRuleId,
} from "@arc/db-schema/job-description-structured-config";
import {
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

type Dimension = (typeof STRUCTURED_RESUME_DIMENSIONS)[number];

const DIMENSION_LABELS: Record<Dimension, string> = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
};

const DIMENSION_BY_LABEL = Object.fromEntries(
  Object.entries(DIMENSION_LABELS).map(([dimension, label]) => [label, dimension]),
) as Record<string, Dimension>;

const RULE_LABELS: Record<StructuredResumeRuleId, string> = {
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
};

const RULE_ID_BY_LABEL = Object.fromEntries(
  Object.entries(RULE_LABELS).map(([ruleId, label]) => [label, ruleId]),
) as Record<string, StructuredResumeRuleId>;

const DEGREE_LABELS = {
  associate: "大专及以上",
  bachelor: "本科及以上",
  doctorate: "博士",
  master: "硕士及以上",
} as const;

function experienceValue(value: JobEvaluationRuleDraft["requiredRelevantExperience"]): string {
  return value ? `${value.years} 年｜${value.scopeDescription}` : "未设置";
}

function parseExperienceValue(
  value: string,
  current: JobEvaluationRuleDraft["requiredRelevantExperience"],
): JobEvaluationRuleDraft["requiredRelevantExperience"] {
  const normalized = value.trim();
  if (!normalized || normalized === "未设置") {
    return null;
  }
  const years = Number(normalized.match(/\d+(?:\.\d+)?/)?.[0] ?? current?.years ?? 0);
  const scopeDescription =
    normalized.replace(/^\s*\d+(?:\.\d+)?\s*年(?:以上)?\s*(?:[｜|·,，:：-]\s*)?/, "").trim() ||
    current?.scopeDescription ||
    "岗位相关经验";
  return {
    relevanceScope: current?.relevanceScope ?? "role",
    scopeDescription,
    years,
  };
}

function educationValue(value: JobEvaluationRuleDraft["educationExpectation"]): string {
  if (!value) {
    return "未设置";
  }
  const degree = value.degreeLevel ? DEGREE_LABELS[value.degreeLevel] : "";
  return [degree, value.majorExpectation].filter(Boolean).join("，") || "未设置";
}

function parseEducationValue(value: string): JobEvaluationRuleDraft["educationExpectation"] {
  const normalized = value.trim();
  if (!normalized || normalized === "未设置") {
    return null;
  }
  let degreeLevel: NonNullable<JobEvaluationRuleDraft["educationExpectation"]>["degreeLevel"] =
    null;
  if (normalized.includes("博士")) {
    degreeLevel = "doctorate";
  } else if (normalized.includes("硕士") || normalized.includes("研究生")) {
    degreeLevel = "master";
  } else if (normalized.includes("本科")) {
    degreeLevel = "bachelor";
  } else if (normalized.includes("大专") || normalized.includes("专科")) {
    degreeLevel = "associate";
  }
  const majorExpectation = normalized
    .replaceAll(/(?:博士|硕士|研究生|本科|大专|专科)(?:及以上|以上)?/g, "")
    .replaceAll(/^[\s,，、;；:：|｜·-]+|[\s,，、;；:：|｜·-]+$/g, "")
    .trim();
  return { degreeLevel, majorExpectation: majorExpectation || null };
}

function serializeList(label: string, values: string[]): string[] {
  return [label, ...values.map((value) => `- ${value}`)];
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
      lines.push(...serializeList("核心技能：", ruleDraft.coreSkills));
      lines.push(...serializeList("辅助技能：", ruleDraft.auxiliarySkills));
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
    for (const ruleId of Object.keys(deductionRules) as StructuredResumeRuleId[]) {
      if (STRUCTURED_RESUME_DEDUCTION_CATALOG[ruleId].dimension === dimension) {
        lines.push(serializeDeductionRule(ruleId, deductionRules[ruleId]));
      }
    }
  }
  return lines.join("\n");
}

const TEXT_SECTION_LABELS = new Set([
  "核心技能：",
  "辅助技能：",
  "岗位判断依据：",
  "评估项目：",
  "评分标准：",
  "计分规则：",
  "扣分规则：",
]);

function splitDimensionSections(value: string): Map<Dimension, string[]> {
  const sections = new Map<Dimension, string[]>();
  let dimension: Dimension | null = null;
  for (const rawLine of value.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim();
    const heading = /^【(.+?)(?:｜权重\s*\d+%)?】$/.exec(line);
    if (heading) {
      dimension = DIMENSION_BY_LABEL[heading[1] ?? ""] ?? null;
      if (dimension) {
        sections.set(dimension, []);
      }
      continue;
    }
    if (dimension) {
      sections.get(dimension)?.push(line);
    }
  }
  return sections;
}

function isTextSectionStart(line: string): boolean {
  return (
    TEXT_SECTION_LABELS.has(line) ||
    line.startsWith("相关经验要求：") ||
    line.startsWith("学历与背景要求：")
  );
}

function readTextList(lines: string[], label: string): string[] | null {
  const start = lines.indexOf(label);
  if (start === -1) {
    return null;
  }
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (isTextSectionStart(line)) {
      break;
    }
    const content = line.replace(/^[-*]\s*/, "").trim();
    if (content && content !== "未设置") {
      values.push(content);
    }
  }
  return values;
}

function readInlineValue(lines: string[], label: string): string | null {
  const line = lines.find((item) => item.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function applyDeductionRuleLine(line: string, deductionRules: JobDescriptionDeductionRules): void {
  const content = line.replace(/^[-*]\s*/, "").trim();
  const separatorIndex = content.indexOf("：");
  if (separatorIndex === -1) {
    return;
  }
  const ruleId = RULE_ID_BY_LABEL[content.slice(0, separatorIndex).trim()];
  if (!ruleId) {
    return;
  }
  const setting = content.slice(separatorIndex + 1).trim();
  if (/关闭|禁用|不启用/.test(setting)) {
    deductionRules[ruleId] = { ...deductionRules[ruleId], enabled: false };
    return;
  }
  if (STRUCTURED_RESUME_DEDUCTION_CATALOG[ruleId].directZero) {
    deductionRules[ruleId] = { enabled: true, points: 0 };
    return;
  }
  const points = Number(setting.match(/\d+/)?.[0]);
  if (Number.isFinite(points)) {
    deductionRules[ruleId] = {
      enabled: true,
      points: Math.max(0, Math.min(100, points)),
    };
  }
}

export function parseEvaluationRules(
  value: string,
  currentRuleDraft: JobEvaluationRuleDraft,
  currentDeductionRules: JobDescriptionDeductionRules,
): {
  deductionRules: JobDescriptionDeductionRules;
  ruleDraft: JobEvaluationRuleDraft;
} {
  const ruleDraft: JobEvaluationRuleDraft = structuredClone(currentRuleDraft);
  const deductionRules: JobDescriptionDeductionRules = structuredClone(currentDeductionRules);
  const sections = splitDimensionSections(value);

  for (const [dimension, lines] of sections) {
    const expectations =
      readTextList(lines, "岗位判断依据：") ??
      readTextList(lines, "评估项目：") ??
      readTextList(lines, "评分标准：");
    if (expectations) {
      ruleDraft.dimensionExpectations[dimension] = expectations;
    }
    const deductions = readTextList(lines, "计分规则：") ?? readTextList(lines, "扣分规则：") ?? [];
    for (const deduction of deductions) {
      applyDeductionRuleLine(deduction, deductionRules);
    }
  }

  const skillLines = sections.get("skillMatch") ?? [];
  ruleDraft.coreSkills = readTextList(skillLines, "核心技能：") ?? ruleDraft.coreSkills;
  ruleDraft.auxiliarySkills = readTextList(skillLines, "辅助技能：") ?? ruleDraft.auxiliarySkills;

  const experience = readInlineValue(sections.get("experienceRelevance") ?? [], "相关经验要求：");
  if (experience !== null) {
    ruleDraft.requiredRelevantExperience = parseExperienceValue(
      experience,
      currentRuleDraft.requiredRelevantExperience,
    );
  }

  const education = readInlineValue(sections.get("educationBackground") ?? [], "学历与背景要求：");
  if (education !== null) {
    ruleDraft.educationExpectation = parseEducationValue(education);
  }

  return { deductionRules, ruleDraft };
}

export function JobEvaluationBlueprintPreview({
  deductionRules,
  disabled = false,
  onDeductionRulesChange,
  onRuleDraftChange,
  ruleDraft,
}: {
  deductionRules: JobDescriptionDeductionRules;
  disabled?: boolean;
  onDeductionRulesChange: (rules: JobDescriptionDeductionRules) => void;
  onRuleDraftChange: (draft: JobEvaluationRuleDraft) => void;
  ruleDraft: JobEvaluationRuleDraft;
}) {
  const serializedValue = serializeEvaluationRules({ deductionRules, ruleDraft });
  const [draft, setDraft] = useState(serializedValue);

  useEffect(() => setDraft(serializedValue), [serializedValue]);

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        岗位判断依据说明该维度怎样才算符合岗位；可直接修改依据和计分分值，填写“关闭”可停用计分项。
      </p>
      <Textarea
        aria-label="完整评分规则"
        className="min-h-[40rem] resize-y whitespace-pre-wrap font-mono leading-relaxed"
        disabled={disabled}
        onBlur={() => {
          const parsed = parseEvaluationRules(draft, ruleDraft, deductionRules);
          if (JSON.stringify(parsed.ruleDraft) !== JSON.stringify(ruleDraft)) {
            onRuleDraftChange(parsed.ruleDraft);
          }
          if (JSON.stringify(parsed.deductionRules) !== JSON.stringify(deductionRules)) {
            onDeductionRulesChange(parsed.deductionRules);
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        value={draft}
      />
    </div>
  );
}
