import { z } from "zod";
import type { InterviewQuestionTemplateQuestionInput } from "@arc/db-schema/interview-question-templates";
import { generatedInterviewQuestionSchema } from "@arc/db-schema/interview/types";
import type { GeneratedInterviewQuestion, InterviewQuestion } from "@arc/db-schema/interview/types";
import {
  generateStructuredWithMastraAgent,
  interviewQuestionAgent,
} from "@app/ai-runtime/simple-generators";
import {
  formatCandidatesLabel,
  formatCandidatesResumeContext,
} from "../../forms/utils/ai-candidate-context-format";
import type { AiCandidateContext } from "../../forms/utils/ai-candidate-context-format";

const INTERVIEW_QUESTIONS_PROMPT = `你是一名技术面试出题助手。请根据 HR 的填写指令、候选人简历和岗位信息，生成一组面试题。

## HR 填写指令（最高优先级，必须逐条落实）
{hrPrompt}

## 关联场景
标题：{templateTitle}
说明：{templateDescription}

## 候选人
{candidateContext}

## 岗位信息
{jobContext}

## 候选人简历摘要
{resumeContext}

## 输出要求
- 生成 8 到 12 道面试题，数量与难度分布应匹配 HR 指令（例如「基础 5 道 + 深度 3 道」）
- 题目必须与候选人简历、岗位和 HR 指令高度相关
- 由浅入深：前几道偏 easy/medium，后几道可含 hard
- 每道题是面试官在语音/现场面试中可直接提问的完整问句
- 每道题必须给出考核意图/考核点，说明这题要验证什么能力或风险
- 每道题必须给出追问方向，提供面试官可以顺着候选人回答深挖的方向；不要写标准答案
- 不要输出答案、解析或编号前缀
- 使用中文，除非 HR 指令或岗位要求英文

## 输出 JSON 结构（必须严格遵守，仅输出 JSON 对象）
{
  "interviewQuestions": [
    {
      "difficulty": "easy" | "medium" | "hard",
      "evaluationFocus": "考核意图或能力点",
      "followUpDirections": "追问方向",
      "question": "题目正文"
    }
  ]
}
顶层字段名必须是 interviewQuestions。请直接返回 JSON，不要用 markdown 代码块包裹。`;

function formatJobContext(job: { name: string; prompt: string | null } | null): string {
  if (!job) {
    return "（未指定岗位）";
  }
  return [job.name, job.prompt ? `岗位说明：${job.prompt}` : null].filter(Boolean).join("\n");
}

function normalizeInterviewQuestions(questions: GeneratedInterviewQuestion[]): InterviewQuestion[] {
  return questions.map((question, index) => ({
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
    order: index + 1,
    question: question.question.trim(),
  }));
}

const generationSchema = z.object({
  interviewQuestions: z
    .array(
      generatedInterviewQuestionSchema.extend({
        evaluationFocus: z.string().trim().min(1).max(500),
        followUpDirections: z.string().trim().min(1).max(1000),
      }),
    )
    .min(8, "至少生成 8 道面试题")
    .max(12, "最多生成 12 道面试题"),
});

async function generateInterviewQuestionsFromPrompt(options: {
  candidates: AiCandidateContext[];
  hrPrompt: string;
  jobDescription: { name: string; prompt: string | null } | null;
  templateDescription: string | null;
  templateTitle: string;
}): Promise<InterviewQuestion[]> {
  const candidateContext = formatCandidatesLabel(options.candidates);

  const prompt = INTERVIEW_QUESTIONS_PROMPT.replace("{hrPrompt}", options.hrPrompt.trim())
    .replace("{templateTitle}", options.templateTitle.trim() || "未命名")
    .replace("{templateDescription}", options.templateDescription?.trim() || "（无）")
    .replace("{candidateContext}", candidateContext)
    .replace("{jobContext}", formatJobContext(options.jobDescription))
    .replace("{resumeContext}", formatCandidatesResumeContext(options.candidates));

  const object = await generateStructuredWithMastraAgent({
    agent: interviewQuestionAgent,
    prompt,
    schema: generationSchema,
    temperature: 0.3,
  });

  return normalizeInterviewQuestions(object.interviewQuestions);
}

export async function generateInterviewQuestionTemplateFromPrompt(options: {
  candidates: AiCandidateContext[];
  hrPrompt: string;
  jobDescription: { name: string; prompt: string | null } | null;
  templateDescription: string | null;
  templateTitle: string;
}): Promise<InterviewQuestionTemplateQuestionInput[]> {
  const interviewQuestions = await generateInterviewQuestionsFromPrompt(options);

  return interviewQuestions.map((question, index) => ({
    content: question.question,
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus ?? "",
    followUpDirections: question.followUpDirections ?? "",
    id: crypto.randomUUID(),
    sortOrder: index,
  }));
}
