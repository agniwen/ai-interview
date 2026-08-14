import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studioEntrySource = readFileSync(
  new URL("../../../../mastra/index.ts", import.meta.url),
  "utf-8",
);
const runtimeEntrySource = readFileSync(new URL("../index.ts", import.meta.url), "utf-8");

describe("Mastra entrypoint boundary", () => {
  it("keeps the CLI Studio entrypoint as a re-export of the runtime singleton", () => {
    expect(studioEntrySource).toContain(
      'export { mastra } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/index";',
    );
    expect(studioEntrySource).not.toContain("new Mastra(");
  });

  it("owns Editor and Observability configuration in the runtime module", () => {
    expect(runtimeEntrySource).toContain("editor: new MastraEditor");
    expect(runtimeEntrySource).toContain("observability: new Observability");
  });
});
