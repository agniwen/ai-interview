import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentSources = [
  readFileSync(new URL("../agents/simple-generators.ts", import.meta.url), "utf-8"),
  readFileSync(new URL("../agents/recruiting-copilot-agent.ts", import.meta.url), "utf-8"),
];

describe("Mastra Agent thinking-mode boundary", () => {
  it("keeps every production Agent model behind the no-thinking policy", () => {
    const agentDeclarations = agentSources.flatMap(
      (source) => source.match(/new Agent\(\{/g) ?? [],
    );
    const protectedModels = agentSources.flatMap(
      (source) =>
        source.match(/model: withThinkingDisabled\(mastraModels\.[a-zA-Z]+Model\)/g) ?? [],
    );

    expect(agentDeclarations).toHaveLength(25);
    expect(protectedModels).toHaveLength(agentDeclarations.length);
  });
});
