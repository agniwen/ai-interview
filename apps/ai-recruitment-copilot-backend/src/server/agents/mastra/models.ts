import type { MastraModelConfig as CoreMastraModelConfig } from "@mastra/core/llm";
import { z } from "zod";

const ALIBABA_CODING_PLAN_PREFIX = "alibaba-coding-plan/";
const ALIBABA_PROVIDER_ID = "alibaba";
const DEFAULT_ALIBABA_COMPATIBLE_MODEL = "deepseek-v4-flash-0731";
const DEFAULT_ALIBABA_COMPATIBLE_FAST_MODEL = "deepseek-v4-flash-0731";

export const DEFAULT_CHAT_MODEL = `${ALIBABA_CODING_PLAN_PREFIX}MiniMax-M2.5`;

export interface MastraModelConfig {
  chatModel: CoreMastraModelConfig;
  fastModel: CoreMastraModelConfig;
  longContextModel: CoreMastraModelConfig;
  structuredModel: CoreMastraModelConfig;
  scorerModel: CoreMastraModelConfig;
}

type EnvLike = Record<string, string | undefined>;
interface ModelNames {
  chatModel: string;
  fastModel: string;
  longContextModel: string;
  structuredModel: string;
  scorerModel: string;
}

const mastraModelIdentifierSchemas = {
  id: z.object({ id: z.string() }).passthrough(),
  provider: z.object({ modelId: z.string(), provider: z.string() }).passthrough(),
  providerId: z.object({ modelId: z.string(), providerId: z.string() }).passthrough(),
  string: z.string(),
};

function readEnv(env: EnvLike, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function toAlibabaCodingPlanModelId(modelId: string | undefined): string {
  const trimmed = modelId?.trim();
  if (!trimmed) {
    return DEFAULT_CHAT_MODEL;
  }
  if (trimmed.startsWith(ALIBABA_CODING_PLAN_PREFIX)) {
    return trimmed;
  }
  return `${ALIBABA_CODING_PLAN_PREFIX}${trimmed}`;
}

function toAlibabaCompatibleModelId(modelId: string): string {
  if (modelId.startsWith(ALIBABA_CODING_PLAN_PREFIX)) {
    return modelId.slice(ALIBABA_CODING_PLAN_PREFIX.length);
  }
  return modelId;
}

function getModelNames(
  env: EnvLike,
  defaultModel: string,
  defaultFastModel = defaultModel,
): ModelNames {
  const explicitChatModel = readEnv(env, "MASTRA_CHAT_MODEL") ?? readEnv(env, "ALIBABA_MODEL");
  const chatModel = explicitChatModel ?? defaultModel;
  const longContextModel =
    readEnv(env, "MASTRA_LONG_CONTEXT_MODEL") ?? readEnv(env, "ALIBABA_MODEL") ?? chatModel;
  const structuredModel =
    readEnv(env, "MASTRA_STRUCTURED_MODEL") ??
    readEnv(env, "ALIBABA_STRUCTURED_MODEL") ??
    chatModel;
  const fastModel =
    readEnv(env, "MASTRA_FAST_MODEL") ??
    readEnv(env, "ALIBABA_FAST_MODEL") ??
    (explicitChatModel ? undefined : defaultFastModel) ??
    chatModel;
  const scorerModel = readEnv(env, "MASTRA_SCORER_MODEL") ?? fastModel;

  return {
    chatModel,
    fastModel,
    longContextModel,
    scorerModel,
    structuredModel,
  };
}

function createAlibabaCompatibleModelConfig({
  apiKey,
  baseURL,
  modelId,
}: {
  apiKey: string | undefined;
  baseURL: string;
  modelId: string;
}): CoreMastraModelConfig {
  const config = {
    modelId: toAlibabaCompatibleModelId(modelId),
    providerId: ALIBABA_PROVIDER_ID,
    url: baseURL,
  };
  if (apiKey) {
    return { ...config, apiKey };
  }
  return config;
}

export function getAlibabaCompatibleApiKey(env: EnvLike = process.env): string | undefined {
  return readEnv(env, "ALIBABA_API_KEY") ?? readEnv(env, "ALIBABA_CODING_PLAN_API_KEY");
}

export function getAlibabaCodingPlanApiKey(env: EnvLike = process.env): string | undefined {
  return readEnv(env, "ALIBABA_CODING_PLAN_API_KEY") ?? readEnv(env, "ALIBABA_API_KEY");
}

export function getMastraModelApiKey(env: EnvLike = process.env): string | undefined {
  if (readEnv(env, "ALIBABA_BASE_URL")) {
    return getAlibabaCompatibleApiKey(env);
  }
  return getAlibabaCodingPlanApiKey(env);
}

export function getMastraModelIdentifier(model: CoreMastraModelConfig): string {
  const stringResult = mastraModelIdentifierSchemas.string.safeParse(model);
  if (stringResult.success) {
    return stringResult.data;
  }
  const providerIdResult = mastraModelIdentifierSchemas.providerId.safeParse(model);
  if (providerIdResult.success) {
    return `${providerIdResult.data.providerId}/${providerIdResult.data.modelId}`;
  }
  const idResult = mastraModelIdentifierSchemas.id.safeParse(model);
  if (idResult.success) {
    return idResult.data.id;
  }
  const providerResult = mastraModelIdentifierSchemas.provider.safeParse(model);
  if (providerResult.success) {
    return `${providerResult.data.provider}/${providerResult.data.modelId}`;
  }
  throw new Error("Unable to derive Mastra model identifier.");
}

export function getMastraModelConfig(env: EnvLike = process.env): MastraModelConfig {
  const alibabaBaseURL = readEnv(env, "ALIBABA_BASE_URL");
  if (alibabaBaseURL) {
    const modelNames = getModelNames(
      env,
      DEFAULT_ALIBABA_COMPATIBLE_MODEL,
      DEFAULT_ALIBABA_COMPATIBLE_FAST_MODEL,
    );
    const apiKey = getAlibabaCompatibleApiKey(env);

    return {
      chatModel: createAlibabaCompatibleModelConfig({
        apiKey,
        baseURL: alibabaBaseURL,
        modelId: modelNames.chatModel,
      }),
      fastModel: createAlibabaCompatibleModelConfig({
        apiKey,
        baseURL: alibabaBaseURL,
        modelId: modelNames.fastModel,
      }),
      longContextModel: createAlibabaCompatibleModelConfig({
        apiKey,
        baseURL: alibabaBaseURL,
        modelId: modelNames.longContextModel,
      }),
      scorerModel: createAlibabaCompatibleModelConfig({
        apiKey,
        baseURL: alibabaBaseURL,
        modelId: modelNames.scorerModel,
      }),
      structuredModel: createAlibabaCompatibleModelConfig({
        apiKey,
        baseURL: alibabaBaseURL,
        modelId: modelNames.structuredModel,
      }),
    };
  }

  const modelNames = getModelNames(env, DEFAULT_CHAT_MODEL);
  const chatModel = toAlibabaCodingPlanModelId(modelNames.chatModel);
  const fastModel = toAlibabaCodingPlanModelId(modelNames.fastModel);
  const longContextModel = toAlibabaCodingPlanModelId(modelNames.longContextModel);
  const scorerModel = toAlibabaCodingPlanModelId(modelNames.scorerModel);
  const structuredModel = toAlibabaCodingPlanModelId(modelNames.structuredModel);

  return {
    chatModel,
    fastModel,
    longContextModel,
    scorerModel,
    structuredModel,
  };
}

export function configureAlibabaCodingPlanApiKey(env: NodeJS.ProcessEnv = process.env): void {
  if (readEnv(env, "ALIBABA_BASE_URL")) {
    return;
  }

  if (readEnv(env, "ALIBABA_CODING_PLAN_API_KEY")) {
    return;
  }

  const legacyApiKey = readEnv(env, "ALIBABA_API_KEY");
  if (legacyApiKey) {
    env.ALIBABA_CODING_PLAN_API_KEY = legacyApiKey;
  }
}

export const mastraModels = getMastraModelConfig();
