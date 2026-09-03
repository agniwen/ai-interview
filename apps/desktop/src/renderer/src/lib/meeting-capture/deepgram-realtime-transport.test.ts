import { describe, expect, it } from "vitest";
import {
  createDeepgramLiveUrl,
  createDeepgramResultEventMapper,
} from "./deepgram-realtime-transport";

const baseAuthorization = {
  clientSecret: "temporary-jwt",
  endpointingMs: 1000,
  expiresAt: "2030-01-01T00:00:00.000Z",
  language: "zh-CN",
  model: "nova-3",
  provider: "deepgram",
  track: "microphone",
} as const;

describe("createDeepgramLiveUrl", () => {
  it("enables Nova-3 streaming diarization with conversational endpointing for 24 kHz PCM", () => {
    const url = new URL(createDeepgramLiveUrl(baseAuthorization));

    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      diarize_model: "latest",
      encoding: "linear16",
      endpointing: "1000",
      interim_results: "true",
      language: "zh-CN",
      model: "nova-3",
      sample_rate: "24000",
    });
  });
});

describe("createDeepgramResultEventMapper", () => {
  it("splits one live result when Deepgram changes speakers", () => {
    const toEvents = createDeepgramResultEventMapper();
    const events = toEvents(
      {
        channel: {
          alternatives: [
            {
              transcript: "你好 好的",
              words: [
                { end: 0.4, punctuated_word: "你好，", speaker: 0, start: 0.1, word: "你好" },
                { end: 0.8, punctuated_word: "好的。", speaker: 1, start: 0.5, word: "好的" },
              ],
            },
          ],
        },
        is_final: true,
        speech_final: true,
        start: 0.1,
        type: "Results",
      },
      "microphone",
    );

    expect(events).toEqual([
      expect.objectContaining({
        speakerKey: "microphone:deepgram-speaker-0",
        text: "你好，",
        type: "completed",
      }),
      expect.objectContaining({
        speakerKey: "microphone:deepgram-speaker-1",
        text: "好的。",
        type: "completed",
      }),
    ]);
  });

  it("merges is_final windows into one turn, buffers text, and only completes on speech_final", () => {
    const toEvents = createDeepgramResultEventMapper();
    const result = (
      start: number,
      end: number,
      word: string,
      isFinal: boolean,
      speechFinal: boolean,
    ) =>
      toEvents(
        {
          channel: {
            alternatives: [{ transcript: word, words: [{ end, start, word }] }],
          },
          is_final: isFinal,
          speech_final: speechFinal,
          start,
          type: "Results",
        },
        "microphone",
      )[0];

    // Window A interim (is_final=false) grows in place.
    const interimA = result(0.1, 0.6, "我要", false, false);
    // Window A finalized, speaker keeps talking (speech_final=false).
    const finalA = result(0.1, 0.6, "我要", true, false);
    // Window B finalized, still no pause (start advanced).
    const finalB = result(0.6, 1.2, "吃饭", true, false);
    // Window C finalized with a pause: speech_final=true closes the utterance.
    const finalC = result(1.2, 1.4, "了。", true, true);

    // Same utterance → same turn id (per speaker), so the draft appends instead of starting a new line.
    expect(interimA.itemId).toBe(finalA.itemId);
    expect(finalB.itemId).toBe(finalA.itemId);
    expect(finalC.itemId).toBe(finalA.itemId);
    // No pause yet → still in-progress; only speech_final closes the line.
    expect(interimA.type).toBe("snapshot");
    expect(finalA.type).toBe("snapshot");
    expect(finalB.type).toBe("snapshot");
    expect(finalC.type).toBe("completed");
    // Interim replaces the current window; finalized windows accumulate into the full utterance.
    expect(interimA.text).toBe("我要");
    expect(finalA.text).toBe("我要");
    expect(finalB.text).toBe("我要吃饭");
    expect(finalC.text).toBe("我要吃饭了。");

    // A new utterance after speech_final gets a fresh turn id and clear buffer.
    const next = result(1.6, 2, "再见", true, true);
    expect(next.itemId).not.toBe(finalC.itemId);
    expect(next.text).toBe("再见");
  });

  it("drops overlapping trailing words so a re-emitted window does not duplicate text", () => {
    const toEvents = createDeepgramResultEventMapper();
    const frame = (
      start: number,
      words: { end: number; start: number; word: string }[],
      isFinal: boolean,
      speechFinal: boolean,
    ) =>
      toEvents(
        {
          channel: {
            alternatives: [{ transcript: words.map((word) => word.word).join(" "), words }],
          },
          is_final: isFinal,
          speech_final: speechFinal,
          start,
          type: "Results",
        },
        "microphone",
      );

    // Window A finalizes "200" (ends at 2.0s).
    const [a] = frame(0.5, [{ end: 2, start: 0.4, word: "200" }], true, false);
    // Window B re-emits the same "200" (ends at 1.9s => overlaps A) then adds a new "吗" (2.5s).
    const [b] = frame(
      1.5,
      [
        { end: 1.9, start: 1.5, word: "200" },
        { end: 2.5, start: 2.1, word: "吗" },
      ],
      true,
      false,
    );

    expect(a.text).toBe("200");
    // The overlapping "200" is dropped; only the new "吗" is appended.
    expect(b.text).toBe("200吗");
  });

  it("drops words re-emitted under a different diarization label", () => {
    const toEvents = createDeepgramResultEventMapper();
    const frame = (speaker: number) =>
      toEvents(
        {
          channel: {
            alternatives: [
              {
                transcript: "地址",
                words: [{ end: 1, speaker, start: 0.2, word: "地址" }],
              },
            ],
          },
          is_final: true,
          speech_final: false,
          start: 0.2,
          type: "Results",
        },
        "microphone",
      );

    // Speaker 0 emits "地址" ending at 1.0s.
    const first = frame(0);
    expect(first[0].text).toBe("地址");

    // Deepgram re-attributes the same audio to speaker 1; the word is already emitted.
    expect(frame(1)).toEqual([]);
  });
});
