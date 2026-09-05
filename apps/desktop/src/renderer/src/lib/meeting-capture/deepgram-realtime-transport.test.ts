import { afterEach, describe, expect, it, vi } from "vitest";
import { meetingLiveTranscriptDraftSchema } from "@app/shared/meeting-transcription";
import {
  connectDeepgramRealtimeTranscription,
  createDeepgramLiveUrl,
  createDeepgramResultEventMapper,
} from "./deepgram-realtime-transport";
import {
  appendLiveTranscriptTurn,
  createDurableLiveTranscriptDraft,
} from "./live-transcript-draft";

const baseAuthorization = {
  clientSecret: "temporary-jwt",
  endpointingMs: 1000,
  expiresAt: "2030-01-01T00:00:00.000Z",
  language: "zh-CN",
  model: "nova-3",
  provider: "deepgram",
  track: "microphone",
} as const;

interface FakeDeepgramMessage {
  channel: {
    alternatives: {
      transcript: string;
      words: {
        end: number;
        speaker?: number;
        start: number;
        word: string;
      }[];
    }[];
  };
  from_finalize?: boolean;
  is_final: boolean;
  speech_final?: boolean;
  start: number;
  type: "Results";
}

class FakeDeepgramWebSocket extends EventTarget {
  static readonly CLOSED = 3;
  static readonly CLOSING = 2;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly instances: FakeDeepgramWebSocket[] = [];

  readonly sent: (ArrayBufferLike | ArrayBufferView | Blob | string)[] = [];
  bufferedAmount = 0;
  closeCalls = 0;
  readyState = FakeDeepgramWebSocket.CONNECTING;

  constructor() {
    super();
    FakeDeepgramWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeDeepgramWebSocket.OPEN;
      this.dispatchEvent(new Event("open"));
    });
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = FakeDeepgramWebSocket.CLOSED;
  }

  emitMessage(message: FakeDeepgramMessage): void {
    const event = new Event("message");
    Object.defineProperty(event, "data", { value: JSON.stringify(message) });
    this.dispatchEvent(event);
  }

  emitClose(): void {
    this.readyState = FakeDeepgramWebSocket.CLOSED;
    const event = new Event("close");
    Object.defineProperties(event, {
      code: { value: 1000 },
      reason: { value: "" },
    });
    this.dispatchEvent(event);
  }

  send(data: ArrayBufferLike | ArrayBufferView | Blob | string): void {
    this.sent.push(data);
  }
}

afterEach(() => {
  FakeDeepgramWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
});

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
      utterance_end_ms: "1000",
      vad_events: "true",
    });
  });

  it("uses the meeting-oriented endpointing default", () => {
    const { endpointingMs: _endpointingMs, ...authorization } = baseAuthorization;
    const url = new URL(createDeepgramLiveUrl(authorization));

    expect(url.searchParams.get("endpointing")).toBe("500");
  });
});

describe("createDeepgramResultEventMapper", () => {
  it("replaces interim speaker re-attributions instead of leaking phantom speakers", () => {
    const toEvents = createDeepgramResultEventMapper();
    let turns: NonNullable<ReturnType<typeof appendLiveTranscriptTurn>> = [];
    const apply = (event: ReturnType<typeof toEvents>[number]) => {
      turns = appendLiveTranscriptTurn(turns, "system", "section", event) ?? turns;
    };
    const frame = (
      speaker: number,
      text: string,
      end: number,
      isFinal = false,
      speechFinal = false,
    ) =>
      toEvents(
        {
          channel: {
            alternatives: [
              {
                transcript: text,
                words: [{ end, speaker, start: 34.02, word: text }],
              },
            ],
          },
          is_final: isFinal,
          speech_final: speechFinal,
          start: 34.02,
          type: "Results",
        },
        "system",
      );

    for (const event of frame(0, "那就长这样", 36.1)) {
      apply(event);
    }
    for (const event of frame(1, "那就长这样反正我也不是坏人", 39.3)) {
      apply(event);
    }
    for (const event of frame(2, "那就长这样反正我也不是坏人", 39.3)) {
      apply(event);
    }
    for (const event of frame(0, "那就长这样反正我也不是坏人", 39.3, true, true)) {
      apply(event);
    }

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      final: true,
      speakerKey: "system:deepgram-speaker-0",
      text: "那就长这样反正我也不是坏人",
    });
  });

  it("moves an interim tail to the newly confirmed speaker without duplicating it", () => {
    const toEvents = createDeepgramResultEventMapper();
    let turns: NonNullable<ReturnType<typeof appendLiveTranscriptTurn>> = [];
    const apply = (events: ReturnType<typeof toEvents>) => {
      for (const event of events) {
        turns = appendLiveTranscriptTurn(turns, "system", "section", event) ?? turns;
      }
    };
    const frame = (input: {
      isFinal: boolean;
      speaker: number;
      speechFinal: boolean;
      start: number;
      text: string;
    }) =>
      toEvents(
        {
          channel: {
            alternatives: [
              {
                transcript: input.text,
                words: [
                  {
                    end: input.start + 0.4,
                    speaker: input.speaker,
                    start: input.start,
                    word: input.text,
                  },
                ],
              },
            ],
          },
          is_final: input.isFinal,
          speech_final: input.speechFinal,
          start: input.start,
          type: "Results",
        },
        "system",
      );

    apply(frame({ isFinal: true, speaker: 0, speechFinal: false, start: 0.1, text: "我先说" }));
    apply(frame({ isFinal: false, speaker: 1, speechFinal: false, start: 0.6, text: "等一下" }));
    apply(frame({ isFinal: true, speaker: 1, speechFinal: true, start: 0.6, text: "等一下" }));

    expect(turns.map((turn) => [turn.speakerKey, turn.text, turn.final])).toEqual([
      ["system:deepgram-speaker-0", "我先说", true],
      ["system:deepgram-speaker-1", "等一下", true],
    ]);
  });

  it("keeps punctuation-only Deepgram results inside the durable draft contract", () => {
    const toEvents = createDeepgramResultEventMapper();
    const [event] = toEvents(
      {
        channel: {
          alternatives: [
            {
              transcript: "。",
              words: [
                {
                  end: 0.12,
                  punctuated_word: "。",
                  start: 0.1,
                  word: "",
                },
              ],
            },
          ],
        },
        is_final: true,
        speech_final: true,
        start: 0.1,
        type: "Results",
      },
      "system",
    );

    expect(event).toMatchObject({ text: "。", type: "completed", words: [] });
    const section = {
      id: "capture:system:0",
      sequence: 0,
      startedAt: "2026-09-04T06:32:52.766Z",
      track: "system" as const,
    };
    const turns = appendLiveTranscriptTurn([], "system", section.id, event) ?? [];
    const durable = createDurableLiveTranscriptDraft({
      captureId: "capture",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      language: "zh-CN",
      model: "nova-3",
      provider: "deepgram",
      queuePeakAudioMs: 0,
      queuedAudioMs: 0,
      queuedPcmBytes: 0,
      sections: [section],
      status: "live",
      trackDroppedAudioMs: { microphone: 0, system: 0 },
      trackQueuePeakAudioMs: { microphone: 0, system: 0 },
      trackQueuedAudioMs: { microphone: 0, system: 0 },
      trackStatus: { microphone: "live", system: "live" },
      turns,
    });

    expect(meetingLiveTranscriptDraftSchema.safeParse(durable).success).toBe(true);
  });

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

  it("starts a new turn when a speaker resumes after another speaker interrupts", () => {
    const toEvents = createDeepgramResultEventMapper();
    const raw = {
      channel: {
        alternatives: [
          {
            transcript: "我先说 等一下 我继续",
            words: [
              { end: 0.4, speaker: 0, start: 0.1, word: "我先说" },
              { end: 0.8, speaker: 1, start: 0.5, word: "等一下" },
              { end: 1.2, speaker: 0, start: 0.9, word: "我继续" },
            ],
          },
        ],
      },
      start: 0.1,
      type: "Results" as const,
    };
    const interimEvents = toEvents({ ...raw, is_final: false, speech_final: false }, "microphone");
    expect(interimEvents).toHaveLength(1);
    const events = toEvents({ ...raw, is_final: true, speech_final: true }, "microphone");

    let turns: NonNullable<ReturnType<typeof appendLiveTranscriptTurn>> = [];
    for (const event of [...interimEvents, ...events]) {
      turns = appendLiveTranscriptTurn(turns, "microphone", "section", event) ?? turns;
    }

    expect(turns.map((turn) => [turn.speakerKey, turn.text])).toEqual([
      ["microphone:deepgram-speaker-0", "我先说"],
      ["microphone:deepgram-speaker-1", "等一下"],
      ["microphone:deepgram-speaker-0", "我继续"],
    ]);
  });

  it("preserves overlapping words from an interrupting speaker", () => {
    const toEvents = createDeepgramResultEventMapper();
    const events = toEvents(
      {
        channel: {
          alternatives: [
            {
              transcript: "我正在说 等一下",
              words: [
                { end: 1, speaker: 0, start: 0.1, word: "我正在说" },
                { end: 0.8, speaker: 1, start: 0.5, word: "等一下" },
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

    expect(events.map((event) => [event.speakerKey, event.text])).toEqual([
      ["microphone:deepgram-speaker-0", "我正在说"],
      ["microphone:deepgram-speaker-1", "等一下"],
    ]);
  });

  it("completes the previous turn when a finalized window starts with another speaker", () => {
    const toEvents = createDeepgramResultEventMapper();
    const frame = (speaker: number, start: number, end: number, word: string) =>
      toEvents(
        {
          channel: {
            alternatives: [{ transcript: word, words: [{ end, speaker, start, word }] }],
          },
          is_final: true,
          speech_final: false,
          start,
          type: "Results",
        },
        "microphone",
      );

    const [first] = frame(0, 0.1, 0.5, "我先说");
    const [completedFirst, second] = frame(1, 0.6, 1, "我插话");

    expect(first).toMatchObject({ text: "我先说", type: "snapshot" });
    expect(completedFirst).toMatchObject({
      itemId: first.itemId,
      text: "我先说",
      type: "completed",
    });
    expect(second).toMatchObject({ text: "我插话", type: "snapshot" });
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
    expect(finalC).toMatchObject({
      endMs: 1400,
      startMs: 100,
      words: [
        expect.objectContaining({ text: "我要" }),
        expect.objectContaining({ text: "吃饭" }),
        expect.objectContaining({ text: "了。" }),
      ],
    });

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

  it("completes the active turn when speech_final only repeats finalized words", () => {
    const toEvents = createDeepgramResultEventMapper();
    const frame = (speechFinal: boolean) =>
      toEvents(
        {
          channel: {
            alternatives: [
              {
                transcript: "好的",
                words: [{ end: 1, speaker: 0, start: 0.2, word: "好的" }],
              },
            ],
          },
          is_final: true,
          speech_final: speechFinal,
          start: 0.2,
          type: "Results",
        },
        "microphone",
      );

    const [snapshot] = frame(false);
    const [completed] = frame(true);

    expect(snapshot).toMatchObject({ text: "好的", type: "snapshot" });
    expect(completed).toMatchObject({
      itemId: snapshot.itemId,
      text: "好的",
      type: "completed",
    });
  });

  it("completes the active turn on UtteranceEnd when endpointing did not fire", () => {
    const toEvents = createDeepgramResultEventMapper();
    const [snapshot] = toEvents(
      {
        channel: {
          alternatives: [
            {
              transcript: "背景音乐里继续说",
              words: [{ end: 1, speaker: 0, start: 0.2, word: "背景音乐里继续说" }],
            },
          ],
        },
        is_final: true,
        speech_final: false,
        start: 0.2,
        type: "Results",
      },
      "system",
    );
    const [completed] = toEvents(
      { channel: [0, 1], last_word_end: 1, type: "UtteranceEnd" },
      "system",
    );

    expect(snapshot).toMatchObject({ text: "背景音乐里继续说", type: "snapshot" });
    expect(completed).toMatchObject({
      itemId: snapshot.itemId,
      text: "背景音乐里继续说",
      type: "completed",
    });
    expect(toEvents({ channel: [0, 1], last_word_end: 1, type: "UtteranceEnd" }, "system")).toEqual(
      [],
    );
  });
});

describe("connectDeepgramRealtimeTranscription", () => {
  it("finalizes buffered audio before requesting a graceful stream close", async () => {
    vi.stubGlobal("WebSocket", FakeDeepgramWebSocket);
    const onTranscript = vi.fn();
    const connection = await connectDeepgramRealtimeTranscription({
      authorization: baseAuthorization,
      onDisconnect: vi.fn(),
      onTranscript,
      onWritable: vi.fn(),
    });
    const [socket] = FakeDeepgramWebSocket.instances;
    if (!socket) {
      throw new Error("Deepgram WebSocket was not created");
    }

    const finalizePromise = connection.finalize?.();
    expect(socket.sent).toContain(JSON.stringify({ type: "Finalize" }));
    expect(connection.finalize?.()).toBe(finalizePromise);
    expect(
      socket.sent.filter((frame) => frame === JSON.stringify({ type: "Finalize" })),
    ).toHaveLength(1);
    expect(connection.sendPcm(new Int16Array([1]))).toBe(false);
    socket.emitMessage({
      channel: {
        alternatives: [
          {
            transcript: "最后一句",
            words: [{ end: 1, speaker: 0, start: 0.2, word: "最后一句" }],
          },
        ],
      },
      from_finalize: true,
      is_final: true,
      speech_final: false,
      start: 0.2,
      type: "Results",
    });
    await finalizePromise;

    expect(onTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "最后一句", type: "completed" }),
    );
    await connection.finalize?.();
    expect(
      socket.sent.filter((frame) => frame === JSON.stringify({ type: "Finalize" })),
    ).toHaveLength(1);
    connection.close();
    expect(socket.sent).toContain(JSON.stringify({ type: "CloseStream" }));
    expect(socket.closeCalls).toBe(0);
    socket.emitClose();
  });
});
