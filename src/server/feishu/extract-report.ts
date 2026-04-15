import type { ResumeReportCardProps } from './card';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject } from 'ai';
import { z } from 'zod';

const reportSchema = z.object({
  candidateName: z.string().nullable().describe('候选人姓名，未知则为 null'),
  recommendation: z.enum(['推荐进入下一轮', '暂缓', '淘汰', '待补充信息']).nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  level: z.string().nullable().describe('建议定级，例如 中级 / P5 / P5-P6'),
  team: z.string().nullable().describe('建议团队定位'),
  strengths: z.array(z.string()).max(6).default([]),
  risks: z.array(z.string()).max(6).default([]),
  followUps: z.array(z.string()).max(4).default([]),
});

/**
 * Use a fast LLM to extract structured fields from the streamed
 * resume-screening text so we can render a Feishu summary card.
 *
 * Returns a partial object suitable for passing as ResumeReportCardProps.
 * Falls back to an empty object if extraction fails.
 */
export async function extractResumeReport(
  fullText: string,
): Promise<Partial<ResumeReportCardProps>> {
  const apiKey = process.env.ALIBABA_API_KEY;
  if (!apiKey || !fullText.trim()) {
    return {};
  }

  const baseURL = process.env.ALIBABA_BASE_URL?.trim()
    || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  const provider = createOpenAICompatible({
    name: 'alibaba',
    baseURL,
    apiKey,
    transformRequestBody: body => ({ ...body, enable_thinking: false }),
  });

  const modelId = process.env.ALIBABA_FAST_MODEL ?? 'qwen-turbo';

  try {
    const { object } = await generateObject({
      model: provider(modelId),
      schema: reportSchema,
      prompt: `请从下面这段简历筛选分析中提取结构化要点。
若某项未出现或证据不足，请使用 null 或空数组。

${fullText.slice(0, 8000)}`,
      temperature: 0,
    });

    return object;
  }
  catch {
    return {};
  }
}
