import { BadGatewayException, ServiceUnavailableException } from "@nestjs/common";
import { z } from "zod";
import { rawBackendEnvironment } from "../../config/raw-backend-environment.js";

const aiProviderResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().optional() }).optional() }))
    .optional(),
});
const jsonValueSchema = z.json();

function providerConfig() {
  const alibabaKey = rawBackendEnvironment.ALIBABA_API_KEY?.trim();
  const openAiKey = rawBackendEnvironment.OPENAI_API_KEY?.trim();
  const apiKey = alibabaKey || openAiKey;
  if (!apiKey) {
    throw new ServiceUnavailableException("AI 服务未配置。", {
      errorCode: "AI_PROVIDER_CONFIGURATION_MISSING",
    });
  }
  if (alibabaKey) {
    return {
      apiKey,
      baseUrl: (
        rawBackendEnvironment.ALIBABA_BASE_URL?.trim() ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1"
      ).replace(/\/+$/, ""),
      model:
        rawBackendEnvironment.MASTRA_STRUCTURED_MODEL?.trim() ||
        rawBackendEnvironment.ALIBABA_STRUCTURED_MODEL?.trim() ||
        rawBackendEnvironment.ALIBABA_MODEL?.trim() ||
        "deepseek-v4-flash-0731",
    };
  }
  return {
    apiKey,
    baseUrl: (rawBackendEnvironment.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
      /\/+$/,
      "",
    ),
    model: rawBackendEnvironment.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  };
}

function parseProviderContent(payload: z.infer<typeof aiProviderResponseSchema>) {
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new BadGatewayException("AI 生成结果为空。", {
      errorCode: "AI_PROVIDER_EMPTY_RESPONSE",
    });
  }
  try {
    return jsonValueSchema.parse(JSON.parse(content));
  } catch (error) {
    throw new BadGatewayException("AI 生成结果格式无效。", {
      cause: error,
      errorCode: "AI_PROVIDER_INVALID_RESPONSE",
    });
  }
}

export async function requestStructuredAiJson(
  prompt: string,
): Promise<z.infer<typeof jsonValueSchema>> {
  const { apiKey, baseUrl, model } = providerConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      body: JSON.stringify({
        messages: [{ content: prompt, role: "user" }],
        model,
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new BadGatewayException("AI 生成失败。", {
      cause: error,
      errorCode: "AI_PROVIDER_REQUEST_FAILED",
    });
  }
  if (!response.ok) {
    throw new BadGatewayException("AI 生成失败。", {
      errorCode: "AI_PROVIDER_REQUEST_FAILED",
    });
  }
  return parseProviderContent(aiProviderResponseSchema.parse(await response.json()));
}
