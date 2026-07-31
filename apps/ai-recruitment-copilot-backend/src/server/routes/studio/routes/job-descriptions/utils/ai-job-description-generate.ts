import { z } from "zod";
import {
  generateStructuredWithMastraAgent,
  jobDescriptionDraftAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

const JOB_DESCRIPTION_PROMPT = `你是一名 HR 岗位配置助手。请根据 HR 的填写指令和上下文，生成一份可直接确认和编辑的完整岗位 JD。

## HR 填写指令（最高优先级，必须逐条落实）
{hrPrompt}

## 岗位名称
{jobName}

## 所属部门
{departmentName}

## 输出要求
- jobDescription：使用 Markdown 格式，按“岗位职责、核心技能、辅助技能、经验要求、项目要求、学历/背景、潜力与稳定性要求”分层组织
  - 要求必须明确、分层、可量化，避免“能力优秀”“经验丰富”等无法判断的表述
  - HR 未提供但岗位配置需要的信息，可以结合岗位合理补充；不得虚构公司内部制度、薪资或福利
  - 不得把无法从 HR 指令合理推导的规模、年限、比例或性能数值静默写成硬性要求；需要补充建议值时，必须明确标为“建议值，请 HR 确认”
  - 长度 500–3000 字，既作为简历评估依据，也作为 AI 面试的岗位上下文
- suggestedName：若岗位名称为空或未命名，给出简洁的中文岗位名称；若已有名称则原样返回
- supplementedItems：仅列出 HR 原始指令中没有明确说明、但你在 jobDescription 中主动补充的信息
  - section 只能使用 job_responsibilities、core_skills、supporting_skills、experience、projects、education、potential_stability
  - 每个 section 最多返回一项；同类补充合并到一条 detail 中
  - detail 用一句中文说明具体补充了什么，不能只写分类名称
  - 任何新增的数值阈值、项目规模、工具名称、专业背景或适应性要求，都必须纳入对应 section 的 detail，不能遗漏
  - 仅优化措辞或结构不算补充；没有主动补充时返回空数组
- 使用中文，除非 HR 指令要求英文

## 输出 JSON 结构（必须严格遵守，仅输出 JSON 对象）
{
  "jobDescription": "Markdown 格式的完整岗位 JD",
  "suggestedName": "岗位名称",
  "supplementedItems": [
    {
      "section": "core_skills",
      "detail": "补充了可量化的核心技能实操要求"
    }
  ]
}
顶层字段名必须是 jobDescription、suggestedName、supplementedItems。请直接返回 JSON，不要用 markdown 代码块包裹。`;

const supplementedSectionSchema = z.enum([
  "job_responsibilities",
  "core_skills",
  "supporting_skills",
  "experience",
  "projects",
  "education",
  "potential_stability",
]);

const generationSchema = z.object({
  jobDescription: z.string().trim().min(1).max(10_000),
  suggestedName: z.string().trim().min(1).max(120),
  supplementedItems: z
    .array(
      z.object({
        detail: z.string().trim().min(1).max(200),
        section: supplementedSectionSchema,
      }),
    )
    .max(7),
});

export interface GeneratedJobDescriptionContent {
  jobDescription: string;
  suggestedName: string;
  supplementedItems: {
    detail: string;
    section: z.infer<typeof supplementedSectionSchema>;
  }[];
}

export function normalizeGeneratedJobDescription(value: string): string {
  return value
    .replaceAll(/[ \t]+-{3,}[ \t]+/g, "\n")
    .replaceAll(/[ \t]{2,}(?=#{1,6}\s)/g, "\n\n")
    .replaceAll(/[ \t]{2,}(?=\d+\.\s)/g, "\n")
    .replaceAll(/[ \t]{2,}(?=-\s)/g, "\n")
    .replaceAll(/[ \t]{2,}/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

export async function generateJobDescriptionFromPrompt(options: {
  departmentName: string | null;
  hrPrompt: string;
  jobName: string | null;
}): Promise<GeneratedJobDescriptionContent> {
  const prompt = JOB_DESCRIPTION_PROMPT.replace("{hrPrompt}", options.hrPrompt.trim())
    .replace("{jobName}", options.jobName?.trim() || "（未填写，请根据指令生成）")
    .replace("{departmentName}", options.departmentName?.trim() || "（未指定）");

  const result = await generateStructuredWithMastraAgent({
    agent: jobDescriptionDraftAgent,
    prompt,
    schema: generationSchema,
    temperature: 0.3,
  });
  return {
    ...result,
    jobDescription: normalizeGeneratedJobDescription(result.jobDescription),
  };
}
