import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export interface CreateAlibabaProviderOptions {
  enableThinking?: boolean;
}

function getAlibabaBaseURL(): string {
  return (
    process.env.ALIBABA_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );
}

export function createAlibabaProvider({
  enableThinking = true,
}: CreateAlibabaProviderOptions = {}) {
  const apiKey = process.env.ALIBABA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ALIBABA_API_KEY. Please configure your environment variables.");
  }

  return createOpenAICompatible({
    apiKey,
    baseURL: getAlibabaBaseURL(),
    name: "alibaba",
    ...(!enableThinking && {
      transformRequestBody: (body) => ({
        ...body,
        enable_thinking: false,
      }),
    }),
  });
}
