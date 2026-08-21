import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";

function getAlibabaBaseURL(): string {
  return getRequiredEnv("ALIBABA_BASE_URL");
}

export function disableAlibabaThinking<TBody extends object>(body: TBody) {
  return {
    ...body,
    enable_thinking: false,
  };
}

export function createAlibabaProvider() {
  const apiKey = process.env.ALIBABA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ALIBABA_API_KEY. Please configure your environment variables.");
  }

  return createOpenAICompatible({
    apiKey,
    baseURL: getAlibabaBaseURL(),
    name: "alibaba",
    transformRequestBody: disableAlibabaThinking,
  });
}
