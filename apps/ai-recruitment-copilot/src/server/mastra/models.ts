import "server-only";

import type { LanguageModel } from "ai";
import type { MastraModelConfig } from "@mastra/core/llm";
import { withDevTools } from "@/server/agents/devtools";
import { createAlibabaProvider } from "@/server/agents/provider";

function getAlibabaBaseURL(): string {
  return (
    process.env.ALIBABA_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1"
  );
}

export function createAlibabaLanguageModel({
  enableThinking = true,
  modelId,
}: {
  enableThinking?: boolean;
  modelId: string;
}): LanguageModel {
  return withDevTools(createAlibabaProvider({ enableThinking })(modelId));
}

export function createMastraAlibabaModel({ modelId }: { modelId: string }): MastraModelConfig {
  const apiKey = process.env.ALIBABA_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ALIBABA_API_KEY. Please configure your environment variables.");
  }

  return {
    apiKey,
    modelId,
    providerId: "alibaba",
    url: getAlibabaBaseURL(),
  };
}
