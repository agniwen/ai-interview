import { z } from "zod";
import {
  generateStructuredWithMastraAgent,
  resumeScreeningPolicyDraftAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import type { ResumeScreeningPolicy } from "@arc/shared/resume-screening";

const MIN_EDUCATION_RULE_ID = "minimum-education";
const MIN_WORK_YEARS_RULE_ID = "minimum-work-years";
const REQUIRED_SKILLS_RULE_ID = "required-skills";

const generationSchema = z.object({
  minimumEducation: z.enum(["none", "专科", "本科", "硕士", "博士"]),
  minimumEducationSeverity: z.enum(["info", "warning", "blocking"]),
  minimumWorkYears: z.number().int().min(0).nullable(),
  minimumWorkYearsSeverity: z.enum(["info", "warning", "blocking"]),
  requiredSkills: z.array(z.string().trim().min(1)).max(20),
  requiredSkillsMatchMode: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ count: z.number().int().min(1), type: z.literal("at_least") }),
  ]),
  requiredSkillsSeverity: z.enum(["info", "warning", "blocking"]),
  semanticRequirements: z
    .array(
      z.object({
        requirement: z.string().trim().min(1).max(200),
        severity: z.enum(["info", "warning", "blocking"]),
      }),
    )
    .max(10),
});

const GENERATE_SCREENING_POLICY_PROMPT = `你是一名招聘筛选规则草稿助手。请从当前 JD 中提取“可配置、可确认、可复评”的简历筛选规则草稿。

## 当前岗位
岗位名称：
{name}

岗位描述：
{description}

岗位 Prompt：
{prompt}

## 提取原则
- 只提取 JD 中明确出现或强烈表达的筛选要求，不要补充臆测条件。
- minimumEducation 只在 JD 明确学历门槛时填写；否则输出 "none"。
- minimumWorkYears 只在 JD 明确年限门槛时填写；否则输出 null。
- requiredSkills 只放“简历阶段可判断”的核心技能，不要放软素质、沟通能力、价值观。
- 技能别名不需要穷举，后续证据判断会由 LLM 做语义匹配。
- requiredSkillsMatchMode：如果 JD 表达“都必须会”，用 all；如果是“满足其中若干项”，用 at_least。
- semanticRequirements 放无法用学历、年限、技能列表表达的语义要求，例如特定项目经验、行业背景、0 到 1 经验。
- severity：
  - blocking：JD 明确写“必须/硬性/至少/不可缺少”等强门槛。
  - warning：重要但需要人工核实，或 JD 表达为“优先/希望/加分”。
  - info：仅供参考的信息。
- 不要输出自动淘汰结论，规则只是草稿。

## 输出 JSON
必须严格输出：
{
  "minimumEducation": "none|专科|本科|硕士|博士",
  "minimumEducationSeverity": "info|warning|blocking",
  "minimumWorkYears": number|null,
  "minimumWorkYearsSeverity": "info|warning|blocking",
  "requiredSkills": ["技能"],
  "requiredSkillsMatchMode": {"type":"all"} 或 {"type":"at_least","count":2},
  "requiredSkillsSeverity": "info|warning|blocking",
  "semanticRequirements": [{"requirement":"要求","severity":"info|warning|blocking"}]
}
只输出 JSON，不要输出 Markdown。`;

function buildPrompt(input: { description?: string | null; name?: string | null; prompt: string }) {
  return GENERATE_SCREENING_POLICY_PROMPT.replace("{name}", input.name?.trim() || "（未填写）")
    .replace("{description}", input.description?.trim() || "（未填写）")
    .replace("{prompt}", input.prompt.trim());
}

function clampAtLeastCount(count: number, skillCount: number) {
  return Math.max(1, Math.min(count, skillCount));
}

export async function generateResumeScreeningPolicyFromJobDescription(input: {
  description?: string | null;
  name?: string | null;
  prompt: string;
}): Promise<ResumeScreeningPolicy> {
  const draft = await generateStructuredWithMastraAgent({
    agent: resumeScreeningPolicyDraftAgent,
    prompt: buildPrompt(input),
    schema: generationSchema,
    temperature: 0.1,
  });

  const rules: ResumeScreeningPolicy["rules"] = [];
  if (draft.minimumEducation !== "none") {
    rules.push({
      field: "minimumEducation",
      id: MIN_EDUCATION_RULE_ID,
      level: draft.minimumEducation,
      severity: draft.minimumEducationSeverity,
      type: "field",
    });
  }
  if (draft.minimumWorkYears !== null) {
    rules.push({
      field: "minimumWorkYears",
      id: MIN_WORK_YEARS_RULE_ID,
      severity: draft.minimumWorkYearsSeverity,
      type: "field",
      years: draft.minimumWorkYears,
    });
  }
  const requiredSkills = draft.requiredSkills.map((skill) => skill.trim()).filter(Boolean);
  if (requiredSkills.length > 0) {
    rules.push({
      id: REQUIRED_SKILLS_RULE_ID,
      matchMode:
        draft.requiredSkillsMatchMode.type === "all"
          ? { type: "all" }
          : {
              count: clampAtLeastCount(draft.requiredSkillsMatchMode.count, requiredSkills.length),
              type: "at_least",
            },
      requiredSkills,
      severity: draft.requiredSkillsSeverity,
      type: "skill",
    });
  }
  for (const [index, rule] of draft.semanticRequirements.entries()) {
    const requirement = rule.requirement.trim();
    if (!requirement) {
      continue;
    }
    rules.push({
      id: `semantic-${index + 1}`,
      requirement,
      severity: rule.severity,
      type: "semantic",
    });
  }

  return {
    enabled: rules.length > 0,
    rules,
    version: 1,
  };
}
