import type { ResumeReportCardProps } from './card';
import { z } from 'zod';
import { createResumeAgent } from '@/server/agents/resume-agent';

const reportSchema = z.object({
  candidateName: z.string().nullable(),
  recommendation: z.string().nullable(),
  score: z.number().int().min(0).max(100).nullable(),
  level: z.string().nullable(),
  team: z.string().nullable(),
  strengths: z.array(z.string()).max(6),
  risks: z.array(z.string()).max(6),
  followUps: z.array(z.string()).max(4),
});

const PROMPT_TEMPLATE = `你需要从下面的简历筛选分析文本中提取结构化要点，并严格输出一个 JSON 对象。

【输出要求】
- 只输出一个合法 JSON 对象，不要任何 Markdown 代码块、不要任何解释、不要前后空白以外的字符。
- JSON 必须包含且仅包含以下字段：
  - candidateName: string | null  // 候选人姓名，未知则为 null
  - recommendation: string | null  // 整体建议，例如 "推荐进入下一轮" / "暂缓" / "淘汰" / "待补充信息"
  - score: integer 0-100 | null  // 综合评分
  - level: string | null  // 建议定级，例如 "中级" / "P5" / "P5-P6"
  - team: string | null  // 建议团队定位
  - strengths: string[]  // 候选人优点，最多 6 条
  - risks: string[]  // 关键风险项，最多 6 条
  - followUps: string[]  // 建议追问的问题，最多 4 条
- 若某字段未在分析文本中出现或证据不足，对单值字段使用 null，对数组使用空数组 []，不要编造。

【输出示例】
{"candidateName":"张三","recommendation":"推荐进入下一轮","score":78,"level":"中级","team":"业务前端","strengths":["3 年 React 经验","主导过完整电商项目"],"risks":["跳槽频繁"],"followUps":["请描述最复杂的技术难点"]}

【待提取的分析文本】
`;

const JSON_BLOCK_REGEX = /\{[\s\S]*\}/;

function extractJsonFromText(text: string): unknown {
  // Strip Markdown fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  // Find the outermost { ... } block
  const match = candidate.match(JSON_BLOCK_REGEX);
  if (!match) {
    throw new Error('no json object found in model output');
  }
  return JSON.parse(match[0]);
}

/**
 * Extract structured fields from a resume-screening analysis. The Qwen
 * openai-compatible endpoint rejects `response_format: json_object` unless
 * the literal word "json" appears in the prompt and is also unreliable
 * with AI SDK's `Output.object`, so we ask the model for raw JSON in the
 * prompt and parse it ourselves.
 */
export async function extractResumeReport(
  fullText: string,
): Promise<Partial<ResumeReportCardProps>> {
  if (!fullText.trim()) {
    return {};
  }

  const modelId = process.env.ALIBABA_STRUCTURED_MODEL ?? 'qwen3-max';

  try {
    const agent = createResumeAgent({
      instructions: '你是结构化信息提取助手，按用户要求只输出 JSON。',
      modelId,
      enableThinking: false,
      temperature: 0,
    });

    const { text } = await agent.generate({
      prompt: `${PROMPT_TEMPLATE}${fullText.slice(0, 8000)}`,
    });

    const parsed = extractJsonFromText(text);
    const validated = reportSchema.safeParse(parsed);
    if (!validated.success) {
      console.error('[feishu-extract-report] schema validation failed', {
        issues: validated.error.issues,
        raw: text.slice(0, 500),
      });
      // Fall back to whatever fields we did get
      return parsed as Partial<ResumeReportCardProps>;
    }

    console.log('[feishu-extract-report] extracted', validated.data);
    return validated.data;
  }
  catch (error) {
    console.error('[feishu-extract-report] FAILED:', error);
    return {};
  }
}
