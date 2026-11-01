import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getMastraModelConfig, usesTextJsonStructuredOutput } from "../models";
import { generateStructuredWithMastraAgent } from "../simple-generators";

const schema = z.object({ name: z.string().min(1) });
const capabilityError = new Error(
  "<400> InternalError.Algo.InvalidParameter: This response_format type is unavailable now",
);

describe("structured output provider compatibility", () => {
  it.each(["deepseek-v4-flash-0731", "deepseek-v4.1-flash", "deepseek-future-snapshot"])(
    "generates validated text JSON for Alibaba %s without native structured output",
    async (modelId) => {
      const model = getMastraModelConfig({ ALIBABA_STRUCTURED_MODEL: modelId }).structuredModel;
      expect(usesTextJsonStructuredOutput(model)).toBe(true);
      const generate = vi.fn().mockResolvedValue({ text: '{"name":"张三"}' });
      await expect(
        generateStructuredWithMastraAgent({
          agent: { generate },
          prompt: "提取姓名",
          schema,
          textGenerationFirst: usesTextJsonStructuredOutput(model),
        }),
      ).resolves.toEqual({ name: "张三" });
      expect(generate).toHaveBeenCalledOnce();
      expect(generate.mock.calls[0]?.[1]).not.toHaveProperty("structuredOutput");
    },
  );

  it.each(["alibaba/qwen-plus", "other/deepseek-v4.1-flash"])(
    "preserves native structured output selection for %s",
    (model) => {
      expect(usesTextJsonStructuredOutput(model)).toBe(false);
    },
  );

  it.each(["throw", "result"])(
    "falls back on the production error delivered as %s",
    async (mode) => {
      const generate = vi.fn();
      if (mode === "throw") {
        generate.mockRejectedValueOnce(capabilityError);
      } else {
        generate.mockResolvedValueOnce({ error: capabilityError, text: "" });
      }
      generate.mockResolvedValueOnce({ text: '{"name":"张三"}' });
      await expect(
        generateStructuredWithMastraAgent({
          agent: { generate },
          fallbackToTextGeneration: true,
          prompt: "提取姓名",
          schema,
          textGenerationFirst: false,
        }),
      ).resolves.toEqual({ name: "张三" });
      expect(generate).toHaveBeenCalledTimes(2);
      expect(generate.mock.calls[0]?.[1]).toHaveProperty("structuredOutput");
      expect(generate.mock.calls[1]?.[1]).not.toHaveProperty("structuredOutput");
    },
  );

  it("rejects text JSON that violates the schema", async () => {
    const generate = vi.fn().mockResolvedValue({ text: '{"name":123}' });
    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "提取姓名",
        schema,
        textGenerationFirst: true,
      }),
    ).rejects.toThrow();
  });

  it.each(["service is unavailable now", "InvalidParameter: max_tokens is invalid"])(
    "does not hide unrelated provider failures: %s",
    async (message) => {
      const error = new Error(message);
      const generate = vi.fn().mockRejectedValue(error);
      await expect(
        generateStructuredWithMastraAgent({
          agent: { generate },
          fallbackToTextGeneration: true,
          prompt: "提取姓名",
          schema,
          textGenerationFirst: false,
        }),
      ).rejects.toBe(error);
      expect(generate).toHaveBeenCalledOnce();
    },
  );
});
