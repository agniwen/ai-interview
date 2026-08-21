import { Agent } from "@mastra/core/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CHAT_MODEL,
  getMastraModelIdentifier,
  getMastraModelConfig,
  getMastraModelApiKey,
  withThinkingDisabled,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";

describe("Mastra model configuration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

    expect(config.chatModel).toEqual({
      modelId: "chat",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.fastModel).toEqual({
      modelId: "legacy-fast",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.longContextModel).toEqual({
      modelId: "legacy-chat",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.structuredModel).toEqual({
      modelId: "legacy-structured",
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    expect(config.scorerModel).toEqual(config.fastModel);
  });

  it("falls back to documented defaults when env is empty", () => {
    const config = getMastraModelConfig({});

    const expected = {
      modelId: DEFAULT_CHAT_MODEL,
      providerId: "alibaba",
      url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    };
    expect(config.chatModel).toEqual(expected);
    expect(config.fastModel).toEqual(expected);
    expect(config.longContextModel).toEqual(expected);
    expect(config.structuredModel).toEqual(expected);
    expect(config.scorerModel).toEqual(expected);
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

  it("does not send a Coding Plan key to the standard compatible endpoint", () => {
    expect(
      getMastraModelApiKey({ ALIBABA_CODING_PLAN_API_KEY: "coding-plan-key" }),
    ).toBeUndefined();
  });

  it("derives a stable identifier from the actual structured model config", () => {
    expect(getMastraModelIdentifier("alibaba-coding-plan/qwen-plus")).toBe(
      "alibaba-coding-plan/qwen-plus",
    );
    expect(
      getMastraModelIdentifier({
        apiKey: "secret",
        modelId: "qwen-plus",
        providerId: "alibaba",
        url: "https://example.com/v1",
      }),
    ).toBe("alibaba/qwen-plus");
  });

  it("disables reasoning for every Mastra agent model call", () => {
    const model = {
      modelId: "deepseek-v4-flash-0731",
      providerId: "alibaba",
      url: "https://example.com/v1",
    } as const;

    expect(withThinkingDisabled(model)).toEqual([
      {
        model,
        modelSettings: { reasoning: "none" },
        providerOptions: {
          alibaba: { enable_thinking: false },
        },
      },
    ]);
  });

  it("sends enable_thinking false through the default outbound model request", async () => {
    const requestBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string | URL | Request, init?: RequestInit) => {
        requestBodies.push(String(init?.body));
        return Promise.resolve(
          Response.json({
            choices: [
              {
                finish_reason: "stop",
                index: 0,
                message: { content: "ok", role: "assistant" },
              },
            ],
            created: 1,
            id: "mock-completion",
            model: DEFAULT_CHAT_MODEL,
            object: "chat.completion",
            usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
          }),
        );
      }),
    );
    const config = getMastraModelConfig({ ALIBABA_API_KEY: "test-key" });
    const agent = new Agent({
      id: "thinking-disabled-probe",
      instructions: "test",
      model: withThinkingDisabled(config.chatModel),
      name: "ThinkingDisabledProbe",
    });

    await agent.generate("hello");

    expect(requestBodies).toHaveLength(1);
    expect(JSON.parse(requestBodies[0] ?? "{}")).toMatchObject({
      enable_thinking: false,
      model: DEFAULT_CHAT_MODEL,
    });
  });
});
