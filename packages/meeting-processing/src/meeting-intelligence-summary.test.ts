import { expect, it } from "vitest";
import { completedIntelligenceSummary } from "./meeting-intelligence-summary";
it("publishes final questions and timestamps without another model call", () => {
  const result = completedIntelligenceSummary({
    captureId: "d973ea74-f0d0-4545-b34f-6a2d4a760b13",
    content: {
      actionItems: [],
      decisions: [],
      openQuestions: [{ evidenceTurnIds: ["turn-1"], question: "上线条件未明确。" }],
      summary: "上线条件尚未说完。",
      template: "general",
      topics: Array.from({ length: 13 }, (_, index) => ({
        evidenceTurnIds: ["turn-1"],
        summary: `内容${index}`,
        title: `主题${index}`,
      })),
    },
    model: "test",
    now: new Date("2026-09-08T00:00:00Z"),
    previous: null,
    provider: "test",
    turns: [{ endMs: 2000, id: "turn-1", startMs: 0 }],
  });
  expect(result?.topics[13]).toMatchObject({
    endMs: 2000,
    evidenceTurnIds: ["turn-1"],
    startMs: 0,
    summary: "上线条件未明确。",
  });
  expect(result?.topics[12]?.summary).toBe("内容12");
  expect(result?.coveredThroughTurnId).toBe("turn-1");
  expect(result?.revision).toBe(1);
});
