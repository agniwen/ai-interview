import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { zValidator } from "@hono/zod-validator";
import { generateText } from "ai";
import { withDevTools } from "@arc/ai-recruitment-copilot-backend/server/agents/devtools";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resumeTitleRequestSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/schema";
import { sanitizeTitle } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/utils/title";

export const titleRouter = factory
  .createApp()
  .post("/", zValidator("json", resumeTitleRequestSchema), async (c) => {
    const { hasFiles, text } = c.req.valid("json");

    const apiKey = process.env.ALIBABA_API_KEY;

    if (!apiKey) {
      return c.json(
        {
          error: "Missing ALIBABA_API_KEY. Please configure your environment variables.",
        },
        500,
      );
    }

    const baseURL =
      process.env.ALIBABA_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";

    const provider = createOpenAICompatible({
      apiKey,
      baseURL,
      name: "alibaba",
      transformRequestBody: (body) => ({
        ...body,
        enable_thinking: false,
      }),
    });

    const modelId = process.env.ALIBABA_FAST_MODEL ?? "deepseek-v4-flash";

    try {
      const { text: titleText } = await generateText({
        model: withDevTools(provider(modelId)),
        prompt: `你是会话标题助手。请根据用户第一条消息的意图生成一个中文标题。
要求:
- 只输出标题，不要任何解释
- 8 到 16 个字，最长不超过 28 字
- 准确表达任务意图，避免空泛词
- 不要标点结尾
- 若消息中提到候选人简历筛选、评分、对比、面试建议等，请体现关键动作
- 若包含上传文件语境（hasFiles=true），可体现"简历"或"附件"语义

hasFiles=${hasFiles ? "true" : "false"}
用户消息:
${text}`,
        temperature: 0.2,
      });

      const safeTitle = sanitizeTitle(titleText);

      if (!safeTitle) {
        return c.json({ title: "新对话" }, 200);
      }

      return c.json({ title: safeTitle }, 200);
    } catch {
      return c.json({ title: "新对话" }, 200);
    }
  });
