import { generateObject } from "ai";
import { z } from "zod";
import {
  candidateFormQuestionTypeSchema,
  DEFAULT_DISPLAY_MODE,
} from "@arc/db-schema/candidate-forms";
import type { CandidateFormQuestionInput } from "@arc/db-schema/candidate-forms";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import { createAlibabaProvider } from "@arc/ai-recruitment-copilot-backend/server/agents/provider";
import {
  formatCandidatesLabel,
  formatCandidatesResumeContext,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/utils/ai-candidate-context-format";
import type { AiCandidateContext } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/utils/ai-candidate-context-format";

const FORM_QUESTIONS_PROMPT = `你是一名 HR 面试表单设计助手。请根据 HR 的填写指令、候选人简历和岗位信息，设计一组候选人面试前填写的表单题目。

## HR 填写指令（最高优先级，必须逐条落实）
{hrPrompt}

## 表单场景
标题：{templateTitle}
说明：{templateDescription}

## 候选人
{candidateContext}

## 岗位信息
{jobContext}

## 候选人简历摘要
{resumeContext}

## 题目类型说明
- single（单选题）：候选人只能选一个答案，需 2-8 个具体选项
- multi（多选题）：候选人可选多个答案，需 2-8 个具体选项
- text（填写题）：候选人自由填写文本，options 必须为空数组

## 输出要求
- 题目数量与题型分布以 HR 填写指令为准
- 题目必须与岗位和 HR 指令高度相关
- 选项文案要具体、可作答，禁止使用「选项 1」「选项 2」等占位符
- 单选/多选的 value 使用英文 snake_case（如 frontend_engineer），label 用中文
- 合理搭配 single、multi、text 三种题型
- 大部分题目设为必填（required: true），少量选填题用于补充信息
- helperText 可选，用于给候选人的填写提示
- 使用中文，除非 HR 指令或岗位要求英文

## 输出 JSON 结构（必须严格遵守，仅输出 JSON 对象）
{
  "questions": [
    {
      "type": "single" | "multi" | "text",
      "label": "题目正文",
      "helperText": "可选提示",
      "required": true,
      "options": [{ "label": "选项文案", "value": "option_value" }]
    }
  ]
}
顶层字段名必须是 questions。填写题 options 必须为 []。请直接返回 JSON，不要用 markdown 代码块包裹。`;

const aiGeneratedFormQuestionSchema = z.object({
  helperText: z.string().max(500).optional(),
  label: z.string().trim().min(1).max(500),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        value: z.string().trim().min(1).max(200),
      }),
    )
    .max(20),
  required: z.boolean(),
  type: candidateFormQuestionTypeSchema,
});

const generationSchema = z.object({
  questions: z.array(aiGeneratedFormQuestionSchema).min(1).max(25),
});

function formatJobContext(job: { name: string; prompt: string | null } | null): string {
  if (!job) {
    return "（未指定岗位）";
  }
  return [job.name, job.prompt ? `岗位说明：${job.prompt}` : null].filter(Boolean).join("\n");
}

function normalizeGeneratedQuestions(
  questions: z.infer<typeof aiGeneratedFormQuestionSchema>[],
): CandidateFormQuestionInput[] {
  return questions.map((question, index) => {
    const { type } = question;
    const options =
      type === "text"
        ? []
        : question.options.map((option, optionIndex) => ({
            label: option.label.trim(),
            value: option.value.trim() || `option_${optionIndex + 1}`,
          }));

    return {
      displayMode: DEFAULT_DISPLAY_MODE[type],
      helperText: question.helperText?.trim() || "",
      id: crypto.randomUUID(),
      label: question.label.trim(),
      options,
      required: question.required,
      sortOrder: index,
      type,
    };
  });
}

export async function generateFormQuestionsFromPrompt(options: {
  candidates: AiCandidateContext[];
  hrPrompt: string;
  jobDescription: { name: string; prompt: string | null } | null;
  templateDescription: string | null;
  templateTitle: string;
}): Promise<CandidateFormQuestionInput[]> {
  const provider = createAlibabaProvider({ enableThinking: false });
  const modelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");

  const candidateContext = formatCandidatesLabel(options.candidates);

  const prompt = FORM_QUESTIONS_PROMPT.replace("{hrPrompt}", options.hrPrompt.trim())
    .replace("{templateTitle}", options.templateTitle.trim() || "未命名面试表单")
    .replace("{templateDescription}", options.templateDescription?.trim() || "（无）")
    .replace("{candidateContext}", candidateContext)
    .replace("{jobContext}", formatJobContext(options.jobDescription))
    .replace("{resumeContext}", formatCandidatesResumeContext(options.candidates));

  let object: z.infer<typeof generationSchema>;
  try {
    ({ object } = await generateObject({
      model: provider(modelId),
      prompt,
      schema: generationSchema,
      temperature: 0.3,
    }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("did not match schema")) {
      throw new Error("AI 生成的题目数量或格式不符合要求，请调整指令（最多 25 道题）后重试。", {
        cause: error,
      });
    }
    throw error;
  }

  const parsed = generationSchema.safeParse(object);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "AI 生成的表单题目校验失败。");
  }

  for (const question of parsed.data.questions) {
    if (question.type !== "text" && (question.options.length < 2 || question.options.length > 8)) {
      throw new Error(`题目「${question.label}」的选项数量需在 2 到 8 个之间。`);
    }
    if (question.type === "text" && question.options.length > 0) {
      throw new Error(`填写题「${question.label}」不应包含选项。`);
    }
  }

  return normalizeGeneratedQuestions(parsed.data.questions);
}
