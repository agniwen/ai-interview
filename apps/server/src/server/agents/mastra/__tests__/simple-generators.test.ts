import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  generateStructuredWithMastraAgent,
  generateTextWithMastraAgent,
  StructuredOutputValidationError,
} from "@app/server/server/agents/mastra/agents/simple-generators";

describe("simple Mastra generators", () => {
  it("generates text with model settings", async () => {
    const generate = vi.fn().mockResolvedValue({ text: "标题" });

    await expect(
      generateTextWithMastraAgent({
        agent: { generate },
        prompt: "生成标题",
        temperature: 0.2,
      }),
    ).resolves.toBe("标题");

    expect(generate).toHaveBeenCalledWith("生成标题", {
      modelSettings: { temperature: 0.2 },
    });
  });

  it("generates structured output with the original Zod schema", async () => {
    const schema = z.object({ title: z.string().min(1) });
    const generate = vi.fn().mockResolvedValue({ object: { title: "前端工程师" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        schema,
        temperature: 0.3,
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledWith("生成结构化对象", {
      modelSettings: { temperature: 0.3 },
      structuredOutput: { schema },
    });
  });

  it("records prompt size and provider token usage for an observed structured call", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const generate = vi.fn().mockResolvedValue({
      object: { title: "前端工程师" },
      text: "",
      usage: { inputTokens: 321, outputTokens: 45, totalTokens: 366 },
    });

    await generateStructuredWithMastraAgent({
      agent: { generate },
      observabilityLabel: "structured-resume-hard-gates",
      prompt: "生成结构化对象",
      schema: z.object({ title: z.string().min(1) }),
      textGenerationFirst: false,
    });

    expect(info).toHaveBeenCalledWith("[mastra-structured-generation] model call completed", {
      attempt: 1,
      inputTokens: 321,
      label: "structured-resume-hard-gates",
      mode: "structured-output",
      outputTokens: 45,
      promptCharacters: 7,
      totalTokens: 366,
    });
  });

  it("records prompt size before an observed structured call fails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const generate = vi.fn().mockRejectedValue(new Error("provider unavailable"));

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        observabilityLabel: "structured-resume-hard-gates",
        prompt: "生成结构化对象",
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).rejects.toThrow("provider unavailable");

    expect(info).toHaveBeenCalledWith("[mastra-structured-generation] model call started", {
      attempt: 1,
      label: "structured-resume-hard-gates",
      mode: "structured-output",
      promptCharacters: 7,
    });
  });

  it("recovers a valid structured object from fenced model text", async () => {
    const generate = vi.fn().mockResolvedValue({
      object: undefined,
      text: '```json\n{"title":"前端工程师"}\n```',
    });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("normalizes recoverable model JSON before final schema validation", async () => {
    const generate = vi.fn().mockResolvedValue({
      object: { units: 0 },
      text: '{"units":0}',
    });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        normalizeInvalid: (value) => {
          const parsed = z.object({ units: z.number() }).safeParse(value);
          return parsed.success ? { units: Math.max(1, parsed.data.units) } : value;
        },
        prompt: "生成结构化对象",
        schema: z.object({ units: z.number().int().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ units: 1 });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once with validation feedback after an invalid structured object", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ object: { title: "" }, text: "" })
      .mockResolvedValueOnce({ object: { title: "前端工程师" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1, "标题不能为空") }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain("标题不能为空");
    expect(generate.mock.calls[1]?.[0]).toContain("重新输出完整的 JSON 对象");
  });

  it("retries once when the structured provider returns an error result", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("invalid structured output"), text: "" })
      .mockResolvedValueOnce({ object: { title: "前端工程师" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("recovers the raw value attached to a provider schema error without another model call", async () => {
    const providerError = Object.assign(new Error("STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED"), {
      details: { value: '{"title":"前端工程师"}' },
    });
    const generate = vi.fn().mockResolvedValue({ error: providerError, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once when the structured provider throws a validation error", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED"))
      .mockResolvedValueOnce({ object: { title: "前端工程师" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain("STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED");
  });

  it("can fall back to schema-validated plain JSON generation", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ object: undefined, text: "" })
      .mockResolvedValueOnce({ object: undefined, text: "" })
      .mockResolvedValueOnce({ text: '{"title":"前端工程师"}' });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        fallbackToTextGeneration: true,
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls[2]?.[1]).not.toHaveProperty("structuredOutput");
    expect(generate.mock.calls[2]?.[0]).toContain("只输出一个严格符合上述字段和类型的 JSON 对象");
  });

  it("uses one text JSON request when the configured model is text-first", async () => {
    const generate = vi.fn().mockResolvedValueOnce({ text: '{"title":"前端工程师"}' });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: true,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[1]).not.toHaveProperty("structuredOutput");
    expect(generate.mock.calls[0]?.[0]).not.toContain("原生结构化输出不可用");
  });

  it("retries text-first JSON generation once after invalid model output", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ text: "这不是有效的 JSON" })
      .mockResolvedValueOnce({ text: '{"title":"前端工程师"}' });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: true,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain(
      "Failed to parse structured output from model response.",
    );
    expect(generate.mock.calls[1]?.[0]).toContain("重新输出完整的 JSON 对象");
    expect(generate.mock.calls[1]?.[1]).not.toHaveProperty("structuredOutput");
  });

  it("falls back to plain JSON when the provider rejects native response_format", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("response_format json_schema is not supported by this model"), {
          statusCode: 400,
        }),
      )
      .mockResolvedValueOnce({ text: '{"title":"前端工程师"}' });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        fallbackToTextGeneration: true,
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[1]).not.toHaveProperty("structuredOutput");
  });

  it("falls back when a response reports unsupported native response_format", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        error: new Error("unsupported response_format json_schema"),
        text: "",
      })
      .mockResolvedValueOnce({ text: '{"title":"前端工程师"}' });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        fallbackToTextGeneration: true,
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[1]).not.toHaveProperty("structuredOutput");
  });

  it("accepts the object channel from plain generation fallback", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ object: undefined, text: "" })
      .mockResolvedValueOnce({ object: undefined, text: "" })
      .mockResolvedValueOnce({ object: { title: "前端工程师" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        fallbackToTextGeneration: true,
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });
  });

  it("does not retry when the structured provider times out", async () => {
    const timeoutError = new Error("Request timed out after 90000ms");
    const generate = vi.fn().mockRejectedValue(timeoutError);

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
      }),
    ).rejects.toBe(timeoutError);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries a transient timeout inside the current structured stage when enabled", async () => {
    const timeoutError = new Error("Request timed out after 240000ms");
    timeoutError.name = "TimeoutError";
    const generate = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({ object: { title: "前端工程师" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        retryOnTransient: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toBe("生成结构化对象");
  });

  it("retries a text-first generation after the provider resets the socket", async () => {
    const socketError = Object.assign(
      new TypeError("The socket connection was closed unexpectedly."),
      { code: "ECONNRESET" },
    );
    const generate = vi
      .fn()
      .mockRejectedValueOnce(socketError)
      .mockResolvedValueOnce({ text: '{"title":"前端工程师"}' });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        retryOnTransient: true,
        retryTextJsonOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: true,
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not let transient retries opt into invalid-output retries", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ object: undefined, text: "" })
      .mockResolvedValueOnce({ object: { title: "不应调用" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnTransient: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
      }),
    ).rejects.toBeInstanceOf(StructuredOutputValidationError);

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("aborts structured generation after the configured timeout", async () => {
    const generate = vi.fn(() => delay(10_000).then(() => ({ text: "" })));

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once when a parsed structured object fails domain validation", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ object: { title: "改写后的引文" }, text: "" })
      .mockResolvedValueOnce({ object: { title: "简历逐字引文" }, text: "" });
    const validate = vi.fn((value: { title: string }) => {
      if (value.title !== "简历逐字引文") {
        throw new Error("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
      }
    });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        retryOnInvalid: true,
        schema: z.object({ title: z.string().min(1) }),
        textGenerationFirst: false,
        validate,
      }),
    ).resolves.toEqual({ title: "简历逐字引文" });

    expect(validate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]).toContain("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
  });

  it("throws the first schema validation message", async () => {
    const generate = vi.fn().mockResolvedValue({ object: { title: "" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        schema: z.object({ title: z.string().min(1, "标题不能为空") }),
        textGenerationFirst: false,
      }),
    ).rejects.toThrow("标题不能为空");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
