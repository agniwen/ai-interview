import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_MODEL,
  getMastraModelConfig,
  getAlibabaCodingPlanApiKey,
  getMastraModelApiKey,
  toAlibabaCodingPlanModelId,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";

describe("Mastra model configuration", () => {
  it("uses Alibaba Coding Plan model ids directly when already qualified", () => {
    expect(toAlibabaCodingPlanModelId("alibaba-coding-plan/qwen3.7-plus")).toBe(
      "alibaba-coding-plan/qwen3.7-plus",
    );
  });

  it("maps legacy Alibaba model names to Mastra provider model ids", () => {
    expect(toAlibabaCodingPlanModelId(" deepseek-v4-pro ")).toBe(
      "alibaba-coding-plan/deepseek-v4-pro",
    );
  });

  it("uses ALIBABA_BASE_URL as an OpenAI-compatible provider config", () => {
    const config = getMastraModelConfig({
      ALIBABA_API_KEY: "legacy-key",
      ALIBABA_BASE_URL: " https://dashscope.aliyuncs.com/compatible-mode/v1 ",
      ALIBABA_FAST_MODEL: "deepseek-v4-flash-0731",
      ALIBABA_MODEL: "deepseek-v4-flash-0731",
      ALIBABA_STRUCTURED_MODEL: "qwen-plus",
    });

    expect(config.chatModel).toEqual({
      apiKey: "legacy-key",
      modelId: "deepseek-v4-flash-0731",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.fastModel).toEqual({
      apiKey: "legacy-key",
      modelId: "deepseek-v4-flash-0731",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.longContextModel).toEqual(config.chatModel);
    expect(config.structuredModel).toEqual({
      apiKey: "legacy-key",
      modelId: "qwen-plus",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.scorerModel).toEqual(config.fastModel);
  });

  it("builds model config from Mastra env first, then legacy Alibaba env", () => {
    const config = getMastraModelConfig({
      ALIBABA_FAST_MODEL: "legacy-fast",
      ALIBABA_MODEL: "legacy-chat",
      ALIBABA_STRUCTURED_MODEL: "legacy-structured",
      MASTRA_CHAT_MODEL: "alibaba-coding-plan/chat",
    });

    expect(config.chatModel).toBe("alibaba-coding-plan/chat");
    expect(config.fastModel).toBe("alibaba-coding-plan/legacy-fast");
    expect(config.longContextModel).toBe("alibaba-coding-plan/legacy-chat");
    expect(config.structuredModel).toBe("alibaba-coding-plan/legacy-structured");
    expect(config.scorerModel).toBe("alibaba-coding-plan/legacy-fast");
  });

  it("falls back to documented defaults when env is empty", () => {
    const config = getMastraModelConfig({});

    expect(config.chatModel).toBe(DEFAULT_CHAT_MODEL);
    expect(config.fastModel).toBe(DEFAULT_CHAT_MODEL);
    expect(config.longContextModel).toBe(DEFAULT_CHAT_MODEL);
    expect(config.structuredModel).toBe(DEFAULT_CHAT_MODEL);
    expect(config.scorerModel).toBe(DEFAULT_CHAT_MODEL);
  });

  it("prefers ALIBABA_CODING_PLAN_API_KEY over legacy ALIBABA_API_KEY", () => {
    expect(
      getAlibabaCodingPlanApiKey({
        ALIBABA_API_KEY: "legacy-key",
        ALIBABA_CODING_PLAN_API_KEY: " coding-plan-key ",
      }),
    ).toBe("coding-plan-key");
  });

  it("falls back to legacy ALIBABA_API_KEY during migration", () => {
    expect(
      getAlibabaCodingPlanApiKey({
        ALIBABA_API_KEY: " legacy-key ",
      }),
    ).toBe("legacy-key");
  });

  it("uses ALIBABA_API_KEY for ALIBABA_BASE_URL provider mode", () => {
    expect(
      getMastraModelApiKey({
        ALIBABA_API_KEY: " alibaba-key ",
        ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        ALIBABA_CODING_PLAN_API_KEY: "coding-plan-key",
      }),
    ).toBe("alibaba-key");
  });
});
