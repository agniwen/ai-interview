import { expect, it } from "vitest";
import { extendSummaryFingerprint } from "@app/shared/meeting-summary-fingerprint";
import { reusableLiveSummaryPrefix } from "./meeting-intelligence-live-prefix";
import { canonicalizeDeepgramLiveTranscriptDraft } from "./deepgram-live-transcript";
import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";

it("reuses an unchanged complete prefix and rejects corrected text, speakers and legacy snapshots", async () => {
  const startedAt = new Date("2026-09-08T00:00:00Z");
  const draft: MeetingLiveTranscriptDraft = {
    capturedAt: startedAt.toISOString(),
    droppedAudioMs: 0,
    droppedPcmFrames: 0,
    error: null,
    sections: [{ id: "s1", sequence: 0, startedAt: startedAt.toISOString(), track: "microphone" }],
    turns: [
      {
        endMs: 1000,
        final: true,
        id: "live1",
        sectionId: "s1",
        startMs: 0,
        text: "下周上线，但条件还没说完。",
        track: "microphone",
      },
    ],
  };
  const source = { endMs: 1000, id: "live1", startMs: 0, text: draft.turns[0]?.text ?? "" };
  const snapshot = {
    captureId: "d973ea74-f0d0-4545-b34f-6a2d4a760b13",
    coveredThroughMs: 1000,
    coveredThroughTurnId: "live1",
    generatedAt: startedAt.toISOString(),
    model: "fast",
    pendingThoughts: [{ evidenceTurnIds: ["live1"], text: "上线条件未明确。" }],
    provider: "test",
    revision: 1,
    sourceFingerprint: await extendSummaryFingerprint(undefined, [source]),
    summary: "上线条件未明确。",
    template: "general",
    topics: [
      {
        endMs: 1000,
        evidenceTurnIds: ["live1"],
        id: "topic1",
        points: [],
        startMs: 0,
        status: "active",
        summary: "上线条件未明确。",
        title: "上线",
      },
    ],
  };
  const turns = canonicalizeDeepgramLiveTranscriptDraft(draft, startedAt).turns.map((turn) => ({
    ...turn,
    id: "final1",
    speakerDisplayName: turn.speakerDisplayName ?? null,
  }));
  expect(await reusableLiveSummaryPrefix({ draft, snapshot, startedAt, turns })).toMatchObject({
    content: { openQuestions: [{ evidenceTurnIds: ["final1"] }] },
    turnCount: 1,
  });
  expect(
    await reusableLiveSummaryPrefix({
      draft,
      snapshot,
      startedAt,
      turns: turns.map((turn) => ({ ...turn, text: "取消上线" })),
    }),
  ).toBeUndefined();
  expect(
    await reusableLiveSummaryPrefix({
      draft,
      snapshot,
      startedAt,
      turns: turns.map((turn) => ({ ...turn, speakerKey: "changed" })),
    }),
  ).toBeUndefined();
  expect(
    await reusableLiveSummaryPrefix({
      draft,
      snapshot: { ...snapshot, sourceFingerprint: undefined },
      startedAt,
      turns,
    }),
  ).toBeUndefined();
  expect(
    await extendSummaryFingerprint(await extendSummaryFingerprint(undefined, [source]), [source]),
  ).toEqual(await extendSummaryFingerprint(undefined, [source, source]));
});
