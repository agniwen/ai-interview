import { expect, it } from "vitest";
import { compactIntelligenceEvidence } from "./meeting-intelligence-evidence";
it("uses short request-local evidence references and restores them after generation", () => {
  const id = "original-transcript-turn-1234567890";
  const compact = compactIntelligenceEvidence(
    JSON.stringify([{ id, text: "条件尚未说完" }]),
    new Set([id]),
  );
  const [alias] = compact.ids;
  if (!alias) {
    throw new Error("missing alias");
  }
  expect(alias.length).toBeLessThan(id.length);
  expect(compact.prompt).not.toContain(id);
  expect(alias).toBe("t1");
  const restored = compact.restore({
    actionItems: [],
    decisions: [],
    openQuestions: [{ evidenceTurnIds: [alias], question: "条件未明确。" }],
    summary: "待补充",
    template: "general",
    topics: [],
  });
  expect(restored).toMatchObject({
    openQuestions: [{ evidenceTurnIds: [id] }],
    template: "general",
  });
  expect(JSON.stringify(restored)).toContain(id);
});
