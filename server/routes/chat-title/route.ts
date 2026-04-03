import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { zValidator } from '@hono/zod-validator';
import { generateText } from 'ai';
import { factory } from '@/server/factory';
import { chatTitleRequestSchema, sanitizeTitle } from './schema';

export const chatTitleRouter = factory.createApp()
  .post('/', zValidator('json', chatTitleRequestSchema), async (c) => {
    const { hasFiles, text } = c.req.valid('json');

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return c.json(
        {
          error:
            'Missing GOOGLE_GENERATIVE_AI_API_KEY. Please configure your environment variables.',
        },
        500,
      );
    }

    const baseURL = process.env.GOOGLE_GENERATIVE_AI_BASE_URL?.trim();
    const provider = createGoogleGenerativeAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });

    const modelId = process.env.GOOGLE_MODEL ?? 'gemini-3-flash-preview';

    try {
      const { text: titleText } = await generateText({
        model: provider(modelId),
        prompt: `你是会话标题助手。请根据用户第一条消息的意图生成一个中文标题。
要求:
- 只输出标题，不要任何解释
- 8 到 16 个字，最长不超过 28 字
- 准确表达任务意图，避免空泛词
- 不要标点结尾
- 若消息中提到候选人简历筛选、评分、对比、面试建议等，请体现关键动作
- 若包含上传文件语境（hasFiles=true），可体现"简历"或"附件"语义

hasFiles=${hasFiles ? 'true' : 'false'}
用户消息:
${text}`,
        temperature: 0.2,
      });

      const safeTitle = sanitizeTitle(titleText);

      if (!safeTitle) {
        return c.json({ title: '新对话' });
      }

      return c.json({ title: safeTitle });
    }
    catch {
      return c.json({ title: '新对话' });
    }
  });
