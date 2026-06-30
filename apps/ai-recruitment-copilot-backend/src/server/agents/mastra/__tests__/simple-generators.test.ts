import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  generateStructuredWithMastraAgent,
  generateTextWithMastraAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

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
      }),
    ).resolves.toEqual({ title: "前端工程师" });

    expect(generate).toHaveBeenCalledWith("生成结构化对象", {
      modelSettings: { temperature: 0.3 },
      structuredOutput: { schema },
    });
  });

  it("throws the first schema validation message", async () => {
    const generate = vi.fn().mockResolvedValue({ object: { title: "" }, text: "" });

    await expect(
      generateStructuredWithMastraAgent({
        agent: { generate },
        prompt: "生成结构化对象",
        schema: z.object({ title: z.string().min(1, "标题不能为空") }),
      }),
    ).rejects.toThrow("标题不能为空");
  });
});
