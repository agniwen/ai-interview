import { generateObject } from "ai";
import { z } from "zod";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import { createAlibabaProvider } from "@arc/ai-recruitment-copilot-backend/server/agents/provider";

const JOB_DESCRIPTION_PROMPT = `你是一名 HR 岗位配置助手。请根据 HR 的填写指令和上下文，生成在招岗位的描述与 AI 面试 Prompt。

## HR 填写指令（最高优先级，必须逐条落实）
{hrPrompt}

## 岗位名称
{jobName}

## 所属部门
{departmentName}

## 输出要求
- description：面向 HR/团队的简要岗位描述，200 字以内，概括职责与核心要求
- prompt：传给语音 AI 面试官的岗位 Prompt，使用 Markdown 格式，包含：
  - 岗位职责与核心技能要求
  - 期望考察的技术/能力维度
  - 面试时应重点追问的方向
  - 长度 500–3000 字，结构清晰，可直接用于 AI 语音面试
- suggestedName：若岗位名称为空或未命名，给出简洁的中文岗位名称；若已有名称则原样返回
- 使用中文，除非 HR 指令要求英文

## 输出 JSON 结构（必须严格遵守，仅输出 JSON 对象）
{
  "description": "简要描述",
  "prompt": "Markdown 格式的岗位 Prompt",
  "suggestedName": "岗位名称"
}
顶层字段名必须是 description、prompt、suggestedName。请直接返回 JSON，不要用 markdown 代码块包裹。`;

const generationSchema = z.object({
  description: z.string().trim().min(1).max(500),
  prompt: z.string().trim().min(1).max(10_000),
  suggestedName: z.string().trim().min(1).max(120),
});

export interface GeneratedJobDescriptionContent {
  description: string;
  prompt: string;
  suggestedName: string;
}

export async function generateJobDescriptionFromPrompt(options: {
  departmentName: string | null;
  hrPrompt: string;
  jobName: string | null;
}): Promise<GeneratedJobDescriptionContent> {
  const provider = createAlibabaProvider({ enableThinking: false });
  const modelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");

  const prompt = JOB_DESCRIPTION_PROMPT.replace("{hrPrompt}", options.hrPrompt.trim())
    .replace("{jobName}", options.jobName?.trim() || "（未填写，请根据指令生成）")
    .replace("{departmentName}", options.departmentName?.trim() || "（未指定）");

  const { object } = await generateObject({
    model: provider(modelId),
    prompt,
    schema: generationSchema,
    temperature: 0.3,
  });

  const parsed = generationSchema.safeParse(object);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "AI 生成的岗位内容校验失败。");
  }

  return parsed.data;
}
