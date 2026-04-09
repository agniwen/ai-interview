import type {
  GeneratedInterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from '@/lib/interview/types';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, NoObjectGeneratedError, Output, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import {
  generatedInterviewQuestionsSchema,
  resumeProfileSchema,
} from '@/lib/interview/types';
import { extractPdfText } from '@/lib/resume-pdf';

const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024;

export class ResumeAnalysisError extends Error {
  stage: 'resume-parsing' | 'question-generation';
  resumeProfile?: ResumeProfile;

  constructor(message: string, stage: 'resume-parsing' | 'question-generation', resumeProfile?: ResumeProfile) {
    super(message);
    this.name = 'ResumeAnalysisError';
    this.stage = stage;
    this.resumeProfile = resumeProfile;
  }
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function trimToNull(value: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeNumber(value: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeResumeProfile(profile: ResumeProfile): ResumeProfile {
  return {
    name: profile.name.trim(),
    age: normalizeNumber(profile.age),
    gender: trimToNull(profile.gender),
    targetRoles: uniqueStrings(profile.targetRoles),
    workYears: normalizeNumber(profile.workYears),
    skills: uniqueStrings(profile.skills),
    schools: uniqueStrings(profile.schools),
    workExperiences: profile.workExperiences.map(experience => ({
      company: trimToNull(experience.company),
      role: trimToNull(experience.role),
      period: trimToNull(experience.period),
      summary: trimToNull(experience.summary),
    })),
    projectExperiences: profile.projectExperiences.map(experience => ({
      name: trimToNull(experience.name),
      role: trimToNull(experience.role),
      period: trimToNull(experience.period),
      techStack: uniqueStrings(experience.techStack),
      summary: trimToNull(experience.summary),
    })),
    personalStrengths: uniqueStrings(profile.personalStrengths),
  };
}

function normalizeInterviewQuestions(questions: GeneratedInterviewQuestion[]) {
  return questions.map((question, index) => ({
    order: index + 1,
    difficulty: question.difficulty,
    question: question.question.trim(),
  }));
}

export function isPdfFile(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function validateResumeFile(file: File) {
  if (!isPdfFile(file)) {
    throw new Error('仅支持上传 PDF 简历。');
  }

  if (file.size > MAX_RESUME_FILE_SIZE) {
    throw new Error('简历 PDF 不能超过 10 MB。');
  }
}

export async function analyzeResumeFile(file: File): Promise<ResumeAnalysisResult> {
  const apiKey = process.env.ALIBABA_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ALIBABA_API_KEY. Please configure your environment variables.');
  }

  validateResumeFile(file);

  const baseURL = process.env.ALIBABA_BASE_URL?.trim()
    || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  const provider = createOpenAICompatible({
    name: 'alibaba',
    baseURL,
    apiKey,
    transformRequestBody: body => ({
      ...body,
      enable_thinking: false,
    }),
  });
  const pdfBytes = Buffer.from(await file.arrayBuffer());
  const pdfParseText = await extractPdfText(pdfBytes);

  let resumeText = pdfParseText;

  if (process.env.AI_GATEWAY_API_KEY) {
    const base64PdfData = pdfBytes.toString('base64');

    try {
      const { steps } = await generateText({
        model: provider(process.env.ALIBABA_FAST_MODEL ?? 'qwen-turbo'),
        temperature: 0,
        stopWhen: stepCountIs(2),
        tools: {
          analyze_pdf_with_vision: tool({
            description: '当提供的简历文本质量差（乱码、空白、内容过少、信息不完整）或明显是从图片 PDF 提取导致丢失大量信息时，调用此工具使用视觉模型重新解析原始 PDF，获取更完整的简历内容。',
            inputSchema: z.object({}),
            execute: async () => {
              const visionModelId = process.env.GOOGLE_VISION_MODEL ?? 'google/gemini-2.5-flash';

              const { text } = await generateText({
                model: visionModelId,
                messages: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'file',
                        data: base64PdfData,
                        mediaType: 'application/pdf',
                      },
                      {
                        type: 'text',
                        text: '请完整提取这份 PDF 简历中的所有文字内容，包括图片中的文字。保持原始结构和排版顺序，不要遗漏任何信息。如果存在表格，用文字形式还原。只输出提取的内容，不要添加任何分析或评论。',
                      },
                    ],
                  },
                ],
              });

              return { resumeText: text };
            },
          }),
        },
        system: '你是一名简历文本质量评估助手。请评估用户提供的从 PDF 中提取的简历文本质量。如果文本包含完整的候选人信息（姓名、教育、技能、经历等），质量良好，请直接原样输出该文本，不做任何修改。如果文本存在以下问题：大量乱码、几乎空白、有效内容极少、关键信息明显缺失、文字断裂不成句，说明 PDF 可能是图片格式，请调用 analyze_pdf_with_vision 工具重新提取，然后输出工具返回的文本。',
        messages: [
          {
            role: 'user',
            content: `请评估以下简历文本质量：\n\n${pdfParseText}`,
          },
        ],
      });

      const toolResult = steps
        .flatMap(step => step.toolResults)
        .find(result => result.toolName === 'analyze_pdf_with_vision');

      if (toolResult && 'output' in toolResult && typeof toolResult.output === 'object' && toolResult.output !== null && 'resumeText' in toolResult.output) {
        resumeText = (toolResult.output as { resumeText: string }).resumeText;
      }
    }
    catch (error) {
      console.error('[resume-vision-eval] Quality evaluation failed, using pdf-parse text:', error instanceof Error ? error.message : error);
    }
  }

  let resumeProfile: ResumeProfile;

  try {
    const { output, text: rawText } = await generateText({
      model: provider(process.env.ALIBABA_STRUCTURED_MODEL ?? 'qwen3-max'),
      temperature: 0,
      output: Output.object({
        schema: resumeProfileSchema,
        name: 'resume_profile',
        description: 'Structured profile extracted from a resume PDF',
      }),
      prompt: `你是一名简历信息提取助手。请从以下简历文本中提取候选人信息，严格按照下方 JSON 结构输出。

## 输出 JSON 结构（必须严格遵守每个字段的类型）

{
  “name”: string,           // 候选人姓名，非空；无法确认时返回”未发现信息”
  “age”: number | null,     // 年龄，仅简历明确给出时填数字，否则 null；不要根据毕业年份猜测
  “gender”: string | null,  // 性别；无法确认时返回”未发现信息”
  “targetRoles”: string[],  // 求职岗位列表；未知时返回 []
  “workYears”: number | null, // 工作年限；无法判断时返回 null
  “skills”: string[],       // 技能列表；未知时返回 []
  “schools”: string[],      // 毕业院校名称列表，每项必须是纯字符串（如 “北京大学”），不要返回对象；未知时返回 []
  “workExperiences”: [      // 工作经历列表；没有则返回 []
    {
      “company”: string | null,  // 公司名；无法确认返回”未发现信息”
      “role”: string | null,     // 岗位名；无法确认返回”未发现信息”
      “period”: string | null,   // 在职时间范围；无法确认返回”未发现信息”
      “summary”: string | null   // 简要描述；无法确认返回”未发现信息”
    }
  ],
  “projectExperiences”: [   // 项目经历列表；没有则返回 []
    {
      “name”: string | null,     // 项目名称；无法确认返回”未发现信息”
      “role”: string | null,     // 项目角色；无法确认返回”未发现信息”
      “period”: string | null,   // 项目时间范围；无法确认返回”未发现信息”
      “techStack”: string[],     // 技术栈列表，此字段必须存在，未知时返回 []
      “summary”: string | null   // 项目描述；无法确认返回”未发现信息”
    }
  ],
  “personalStrengths”: string[] // 个人优势，基于简历归纳；未知时返回 []
}

## 关键约束
- schools 的每一项必须是纯字符串（院校名称），不要返回包含 name/major/degree 的对象。
- projectExperiences 的每一项必须包含 techStack 字段（string[]），即使为空也要写 []，不可省略。
- 所有 string | null 类型的字段，无法确认时返回”未发现信息”，不要返回空字符串 “”。
- 所有数组字段去重，不要输出重复项。
- personalStrengths 必须有简历依据，不要编造。
- 工作经历和项目经历中的 summary 保持简洁，只保留关键职责、成果或内容。
- 不要输出任何 JSON 以外的内容。

简历文本：
${resumeText}`,
    });

    if (!output) {
      console.error('[resume-parsing] Output is null, raw text:', rawText);
      throw new Error('Output validation failed');
    }

    resumeProfile = normalizeResumeProfile(output);
  }
  catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error('[resume-parsing] NoObjectGeneratedError, raw text:', error.text);
      console.error('[resume-parsing] Cause:', error.cause);
    }
    else if (error instanceof Error) {
      console.error('[resume-parsing] Error:', error.message);
    }

    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : 'Failed to extract resume information.',
      'resume-parsing',
    );
  }

  try {
    const { output, text: rawText } = await generateText({
      model: provider(process.env.ALIBABA_STRUCTURED_MODEL ?? 'qwen3-max'),
      temperature: 0.3,
      output: Output.object({
        schema: generatedInterviewQuestionsSchema,
        name: 'interview_questions',
        description: 'Ten Chinese interview questions tailored to a candidate resume and target role',
      }),
      prompt: `你是一名技术面试出题助手。请基于下面的候选人简历结构化信息，生成 10 道中文面试题。

## 输出 JSON 结构（必须严格遵守）

{
  “interviewQuestions”: [
    {
      “difficulty”: “easy” | “medium” | “hard”,
      “question”: string
    }
  ]
}

注意：顶层字段名必须是 “interviewQuestions”，不要用 “questions” 或其他名称。数组必须恰好包含 10 项。

## 出题规则
1. 题目必须与候选人的 targetRoles 高度相关；如果 targetRoles 有多个，优先围绕最核心、最明确的岗位方向出题。
2. 如果 targetRoles 为空，则根据 skills、workExperiences、projectExperiences 推断最可能的岗位方向出题；字符串值为”未发现信息”时视为未知信息，不要围绕它出题。
3. 题目必须由简入深：
   - 第 1-3 题为 easy，聚焦背景了解、经历澄清、基础能力验证。
   - 第 4-7 题为 medium，聚焦项目细节、技术选型、实现思路、问题排查。
   - 第 8-10 题为 hard，聚焦复杂场景、权衡取舍、系统设计、难点复盘。
4. 优先围绕简历中真实出现过的项目经历、工作经历、技能栈来提问，不要输出泛泛而谈的空洞题目。
5. 不要给答案，不要输出解释，不要重复题目。
6. 不要输出任何 JSON 以外的内容。

## 候选人信息
${JSON.stringify(resumeProfile, null, 2)}`,
    });

    if (!output) {
      console.error('[question-generation] Output is null, raw text:', rawText);
      throw new Error('Output validation failed');
    }

    return {
      fileName: file.name,
      resumeProfile,
      interviewQuestions: normalizeInterviewQuestions(output.interviewQuestions),
    };
  }
  catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error('[question-generation] NoObjectGeneratedError, raw text:', error.text);
      console.error('[question-generation] Cause:', error.cause);
    }
    else if (error instanceof Error) {
      console.error('[question-generation] Error:', error.message);
    }

    throw new ResumeAnalysisError(
      error instanceof Error ? error.message : 'Failed to generate interview questions.',
      'question-generation',
      resumeProfile,
    );
  }
}
