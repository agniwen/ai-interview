import { describe, expect, it } from "vitest";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";
import { buildLiveSummaryGraph } from "./meeting-live-summary-panel";

const snapshot: MeetingLiveSummarySnapshot = {
  captureId: "00000000-0000-4000-8000-000000000077",
  coveredThroughMs: 4000,
  coveredThroughTurnId: "turn-2",
  generatedAt: "2026-09-04T06:00:00.000Z",
  model: "model",
  provider: "provider",
  revision: 1,
  summary: "讨论了候选人的项目经历。",
  template: "recruiting-interview",
  topics: [
    {
      endMs: 4000,
      evidenceTurnIds: ["turn-1", "turn-2"],
      id: "topic-project",
      points: [
        {
          endMs: 4000,
          evidenceTurnIds: ["turn-2"],
          id: "point-scale",
          kind: "fact",
          startMs: 3000,
          text: "负责过大规模系统",
        },
      ],
      startMs: 1000,
      status: "active",
      summary: "项目规模与职责。",
      title: "项目经历",
    },
  ],
};

describe("buildLiveSummaryGraph", () => {
  it("creates a stable three-level tree with evidence links", () => {
    const first = buildLiveSummaryGraph(snapshot);
    const second = buildLiveSummaryGraph(snapshot);

    expect(second).toEqual(first);
    expect(
      first.nodes.map(({ evidenceTurnId, id, kind }) => ({ evidenceTurnId, id, kind })),
    ).toEqual([
      { evidenceTurnId: null, id: "meeting-live-summary-root", kind: "root" },
      { evidenceTurnId: "turn-1", id: "topic-project", kind: "topic" },
      { evidenceTurnId: "turn-2", id: "point-scale", kind: "point" },
    ]);
    expect(first.edges).toEqual([
      {
        id: "meeting-live-summary-root:topic-project",
        source: "meeting-live-summary-root",
        target: "topic-project",
      },
      {
        id: "topic-project:point-scale",
        source: "topic-project",
        target: "point-scale",
      },
    ]);
  });
});
