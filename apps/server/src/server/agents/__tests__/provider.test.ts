import { describe, expect, it } from "vitest";
import { disableAlibabaThinking } from "@app/server/server/agents/provider";

describe("Alibaba model provider", () => {
  it("forces thinking off in every request body", () => {
    expect(
      disableAlibabaThinking({
        enable_thinking: true,
        messages: [{ content: "hello", role: "user" }],
        model: "deepseek-v4-flash-0731",
      }),
    ).toEqual({
      enable_thinking: false,
      messages: [{ content: "hello", role: "user" }],
      model: "deepseek-v4-flash-0731",
    });
  });
});
