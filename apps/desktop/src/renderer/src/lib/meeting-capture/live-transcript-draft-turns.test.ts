// oxlint-disable unicorn/consistent-function-scoping -- Keeping the target factory beside these focused batch tests makes the fixtures easier to scan.
import type { LiveCorrectionBatch } from "@app/shared/meeting-live-correction";
import { describe, expect, it } from "vitest";
import { createLiveTranscriptCorrectionBatches } from "./live-transcript-draft-turns";

describe("live transcript correction batches", () => {
  const targets = (onBatch: (batch: LiveCorrectionBatch) => boolean) => ({
    microphone: {
      connection: {
        close: () => {},
        correct: onBatch,
        sendPcm: () => true,
      },
      sectionId: "section",
    },
    system: { connection: null, sectionId: null },
  });

  it("waits for right-side evidence, then flushes a trailing one-to-three block batch", () => {
    const correction = createLiveTranscriptCorrectionBatches();
    const batches: LiveCorrectionBatch[] = [];
    const turns = ["第一块", "第二块", "第三块", "第四块"].map((text, index) => ({
      final: true,
      id: `section:${index}`,
      sectionId: "section",
      text,
      track: "microphone" as const,
    }));

    correction.request(
      turns.slice(0, 3),
      targets((batch) => batches.push(batch) > 0),
      () => {},
    );
    expect(batches).toEqual([]);

    correction.request(
      turns.map((turn, index) => (index === 3 ? { ...turn, final: false } : turn)),
      targets((batch) => batches.push(batch) > 0),
      () => {},
    );
    expect(batches[0]?.blocks.map((block) => block.originalText)).toEqual([
      "第一块",
      "第二块",
      "第三块",
    ]);
    expect(batches[0]?.context.after).toEqual(["第四块"]);
    expect(batches[0]?.lookahead).toMatchObject({
      id: "section:3",
      originalText: "第四块",
    });

    correction.request(
      turns,
      targets((batch) => batches.push(batch) > 0),
      () => {},
      { force: true },
    );
    expect(batches[1]?.blocks.map((block) => block.originalText)).toEqual(["第四块"]);
  });

  it("removes a deleted correction block from the live draft", () => {
    const correction = createLiveTranscriptCorrectionBatches();
    const turns = ["字幕", "对", "继续介绍项目"].map((text, index) => ({
      final: true,
      id: `section:${index}`,
      sectionId: "section",
      text,
      track: "microphone" as const,
    }));
    let batch: LiveCorrectionBatch | undefined;
    correction.request(
      turns,
      targets((value) => {
        batch = value;
        return true;
      }),
      () => {},
      { force: true },
    );
    expect(batch).toBeDefined();
    const updated = correction.apply(turns, {
      batchId: batch?.batchId ?? "",
      blocks: [
        { id: "section:0", text: null },
        { id: "section:1", text: "对" },
        { id: "section:2", text: "继续介绍项目" },
      ],
      model: "asr+llm",
      status: "completed",
      type: "meeting.transcription.correction-batch",
    });
    expect(updated.map((turn) => turn.text)).toEqual(["对", "继续介绍项目"]);
  });
});
