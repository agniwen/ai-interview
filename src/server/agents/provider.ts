import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export interface CreateAlibabaProviderOptions {
  enableThinking?: boolean;
}

export function createAlibabaProvider({
  enableThinking = true,
}: CreateAlibabaProviderOptions = {}) {
  const apiKey = process.env.ALIBABA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ALIBABA_API_KEY. Please configure your environment variables.");
  }

  const baseURL =
    process.env.ALIBABA_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";

  return createOpenAICompatible({
    apiKey,
    baseURL,
    name: "alibaba",
    ...(!enableThinking && {
      transformRequestBody: (body) => ({
        ...body,
        enable_thinking: false,
      }),
    }),
  });
}
