import { describe, expect, it } from "vitest";
import { humanTranscriptionEventSchema } from "@app/shared/human-transcription";
import type {
  HumanTranscriptionEvent,
  HumanTranscriptionPreview,
} from "@app/shared/human-transcription";
import {
  readTranscriptPreview,
  receiveTranscriptPreview,
  visibleTranscriptRows,
} from "./human-meeting-transcript-preview";

const scope = { executionId: "00000000-0000-4000-8000-000000000001", generation: 1, runId: "run" };
const people = { candidate: { displayName: "候选人", role: "candidate" as const } };
const packet: HumanTranscriptionPreview = {
  ...scope,
  event: {
    endMs: 20,
    eventId: "event-1",
    itemId: "sentence-1",
    kind: "interim",
    participantIdentity: "candidate",
    providerTaskId: "task",
    revision: 0,
    startMs: 10,
    streamEpoch: "epoch",
    text: "我负责",
    trackId: "track",
  },
  sequence: 1,
};
const encode = (value: HumanTranscriptionPreview) =>
  new TextEncoder().encode(JSON.stringify(value));

describe("server subtitle previews", () => {
  it("rejects untrusted senders, unknown people, other runs and stale executions", () => {
    expect(readTranscriptPreview(encode(packet), true, scope, people)).toEqual(packet);
    expect(readTranscriptPreview(encode(packet), false, scope, people)).toBeNull();
    expect(readTranscriptPreview(encode(packet), true, scope, {})).toBeNull();
    for (const changed of [
      { runId: "other" },
      { generation: 2 },
      { executionId: "00000000-0000-4000-8000-000000000002" },
    ]) {
      expect(
        readTranscriptPreview(encode({ ...packet, ...changed }), true, scope, people),
      ).toBeNull();
    }
    expect(readTranscriptPreview(new Uint8Array(14_001), true, scope, people)).toBeNull();
  });
  it("shows interim before persistence, replaces it with final and deduplicates late SSE", () => {
    let previews = receiveTranscriptPreview([], packet, 100);
    expect(visibleTranscriptRows([], previews, scope, people, 100)[0]?.event.text).toBe("我负责");
    const final = {
      ...packet,
      event: {
        ...packet.event,
        eventId: "final-id",
        kind: "final" as const,
        text: "我负责系统开发。",
      },
      sequence: 2,
    };
    previews = receiveTranscriptPreview(previews, final, 200);
    expect(visibleTranscriptRows([], previews, scope, people, 200)).toHaveLength(1);
    const saved: HumanTranscriptionEvent = final.event;
    const rows = visibleTranscriptRows([saved], previews, scope, people, 300);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pending).toBe(false);
    expect(rows[0]?.event.text).toBe("我负责系统开发。");
    expect(humanTranscriptionEventSchema.safeParse(packet.event).success).toBe(false);
  });
  it("ignores reordered previews and late interim after a final", () => {
    const final = {
      ...packet,
      event: { ...packet.event, kind: "final" as const, text: "最终句子" },
      sequence: 3,
    };
    let previews = receiveTranscriptPreview([], final, 100);
    previews = receiveTranscriptPreview(previews, { ...packet, sequence: 2 }, 200);
    previews = receiveTranscriptPreview(previews, { ...packet, sequence: 4 }, 300);
    expect(previews[0]?.event.text).toBe("最终句子");
    expect(
      visibleTranscriptRows(
        [final.event],
        receiveTranscriptPreview([], packet, 400),
        scope,
        people,
        400,
      )[0]?.pending,
    ).toBe(false);
  });
  it("expires disconnected drafts, fences old runs and restores persisted history", () => {
    const previews = receiveTranscriptPreview([], packet, 100);
    expect(visibleTranscriptRows([], previews, scope, people, 15_100)).toHaveLength(0);
    expect(
      visibleTranscriptRows([], previews, { ...scope, generation: 2 }, people, 100),
    ).toHaveLength(0);
    const saved = { ...packet.event, kind: "final" as const };
    expect(visibleTranscriptRows([saved], [], scope, people, 90_000)).toHaveLength(1);
  });
});
