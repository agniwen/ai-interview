import { describe, expect, it } from "vitest";
import { projectHumanTranscription } from "./human-transcription-projection";
import type { HumanTranscriptionEvent } from "./human-transcription";
const event = (patch: Partial<HumanTranscriptionEvent> = {}): HumanTranscriptionEvent => ({
  endMs: 1000,
  eventId: "e",
  itemId: "sentence-1",
  kind: "final",
  participantIdentity: "candidate_1",
  providerTaskId: "task",
  revision: 0,
  startMs: 0,
  streamEpoch: "epoch",
  text: "回答",
  trackId: "TR_1",
  ...patch,
});
const participants = { candidate_1: { displayName: "候选人", role: "candidate" as const } };
describe("human transcription projection", () => {
  it("keeps the latest correction and distinct repeated sentences", () => {
    const result = projectHumanTranscription(
      [
        event(),
        event({ revision: 1, text: "修正" }),
        event({ endMs: 3000, itemId: "sentence-2", startMs: 2000 }),
      ],
      participants,
    );
    expect(result.turns.map((t) => t.text)).toEqual(["修正", "回答"]);
  });
  it("never makes a gap or unknown identity eligible", () => {
    expect(
      projectHumanTranscription([event(), event({ kind: "gap" })], participants).eligible,
    ).toBe(false);
    expect(
      projectHumanTranscription([event({ participantIdentity: "unknown" })], participants).eligible,
    ).toBe(false);
  });
  it("uses track identity, not arrival order or display name", () => {
    const result = projectHumanTranscription(
      [event({ endMs: 6000, startMs: 5000 }), event({ itemId: "s0" })],
      participants,
    );
    expect(result.eligible).toBe(true);
    expect(result.turns[0]?.startMs).toBe(0);
    expect(result.turns[0]?.attribution).toEqual({
      method: "track",
      participantIdentity: "candidate_1",
      role: "candidate",
      sourceId: "TR_1",
    });
  });
});
