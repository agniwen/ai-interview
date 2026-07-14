import type { AgentInstructions } from "@mastra/core/agent";
import { describe, expect, it } from "vitest";
import { extractPrompt } from "./extractPrompt";

describe("extractPrompt", () => {
  it("normalizes string instructions", () => {
    expect(extractPrompt("  You are a helpful assistant  ")).toBe(
      "You are a helpful assistant",
    );
  });

  it("extracts object instructions", () => {
    const instructions: AgentInstructions = {
      content: "Be concise",
      role: "system",
    };

    expect(extractPrompt(instructions)).toBe("Be concise");
  });

  it("joins instruction arrays in order", () => {
    const instructions: AgentInstructions = [
      { content: "First", role: "system" },
      { content: "Second", role: "system" },
    ];

    expect(extractPrompt(instructions)).toBe("First\n\nSecond");
  });
});
