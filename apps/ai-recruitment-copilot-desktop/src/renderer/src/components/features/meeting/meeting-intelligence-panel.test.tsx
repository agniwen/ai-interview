import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingIntelligenceResult } from "@arc/shared/meeting-intelligence";
import type { FinalMeetingTranscriptRevision } from "@arc/shared/meeting-transcription";
import {
  canRegenerateMeetingIntelligence,
  intelligenceEvidenceTurns,
  MeetingIntelligenceView,
} from "./meeting-intelligence-panel";

const result: MeetingIntelligenceResult = {
  canRegenerate: true,
  current: {
    content: {
      actionItems: [],
      decisions: [{ evidenceTurnIds: ["turn-1"], statement: "采用方案 A" }],
      openQuestions: [],
      summary: "讨论了方案。",
      template: "general",
      topics: [],
    },
    createdAt: "2026-08-09T12:00:00.000Z",
    createdBy: null,
    id: "intelligence-1",
    model: "provider/model",
    promptVersion: "meeting-intelligence-v1",
    provider: "provider",
    revision: 1,
    template: "general",
    transcriptRevisionId: "transcript-1",
  },
  error: null,
  history: [],
  state: "ready",
  suggestedTemplate: "general",
};

const transcript: FinalMeetingTranscriptRevision = {
  basedOnRevisionId: null,
  createdAt: "2026-08-09T11:00:00.000Z",
  createdBy: null,
  id: "transcript-1",
  kind: "final",
  language: "zh",
  model: "transcriber",
  provider: "openai",
  region: "default",
  revision: 1,
  turns: [
    {
      confidence: null,
      endMs: 2500,
      id: "turn-1",
      sequence: 0,
      speakerDisplayName: null,
      speakerKey: "local",
      startMs: 1250,
      text: "采用方案 A",
      track: "local",
    },
  ],
};

describe("Meeting Intelligence panel", () => {
  it("keeps regeneration to Owner and administrator", () => {
    expect(canRegenerateMeetingIntelligence("viewer")).toBe(false);
    expect(canRegenerateMeetingIntelligence("editor")).toBe(false);
    expect(canRegenerateMeetingIntelligence("owner")).toBe(true);
    expect(canRegenerateMeetingIntelligence("administrator")).toBe(true);
  });

  it("shows exact version provenance and transcript evidence locations", () => {
    const html = renderToStaticMarkup(
      <MeetingIntelligenceView
        onRegenerate={() => {}}
        onSeek={() => {}}
        result={result}
        selectedTemplate="general"
        transcript={transcript}
      />,
    );
    expect(html).toContain("revision 1");
    expect(html).toContain("provider/model");
    expect(html).toContain("meeting-intelligence-v1");
    expect(html).toContain("transcript-1");
    expect(html).toContain("00:01");
    expect(html).toContain("采用方案 A");
    expect(intelligenceEvidenceTurns(["turn-1"], transcript)).toEqual([
      expect.objectContaining({ id: "turn-1", startMs: 1250 }),
    ]);
  });

  it("prevents another regeneration while the current request is pending", () => {
    const html = renderToStaticMarkup(
      <MeetingIntelligenceView
        onRegenerate={() => {}}
        onSeek={() => {}}
        result={{ ...result, state: "processing" }}
        selectedTemplate="general"
        transcript={transcript}
      />,
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain("正在生成…");
  });
});
