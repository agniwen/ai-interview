import { describe, expect, it, vi } from "vitest";
import type { LiveCorrectionBatch } from "@arc/shared/meeting-live-correction";
import {
  relayHumanInterviewTranscriptMessage,
  relayHumanInterviewTranscriptPcm,
} from "./_human-interview-live-transcript";

const correctionBatch: LiveCorrectionBatch = {
  batchId: "00000000-0000-4000-8000-000000000001",
  blocks: [
    {
      id: "capture:microphone:0:item-1",
      itemId: "item-1",
      originalText: "候选人介绍项目经验",
      sectionId: "capture:microphone:0",
      track: "microphone",
    },
  ],
  context: { after: [], before: [] },
};

describe("human interview live transcript relay", () => {
  it("acknowledges a PCM frame even when provider backpressure drops it", () => {
    const send = vi.fn();

    relayHumanInterviewTranscriptPcm({
      bytes: new Uint8Array(320),
      send,
      sendPcm: vi.fn(() => false),
    });

    expect(send.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
      { type: "backpressure" },
      { byteLength: 320, type: "pcm-ack" },
    ]);
  });

  it("routes correction messages to the capture correction session instead of PCM", () => {
    const correct = vi.fn();
    const sendPcm = vi.fn(() => true);

    relayHumanInterviewTranscriptMessage({
      bytes: new Uint8Array(
        Buffer.from(JSON.stringify({ batch: correctionBatch, type: "correct" })),
      ),
      close: vi.fn(),
      correct,
      rawData: JSON.stringify({ batch: correctionBatch, type: "correct" }),
      send: vi.fn(),
      sendPcm,
    });

    expect(correct).toHaveBeenCalledWith(correctionBatch);
    expect(sendPcm).not.toHaveBeenCalled();
  });
});
