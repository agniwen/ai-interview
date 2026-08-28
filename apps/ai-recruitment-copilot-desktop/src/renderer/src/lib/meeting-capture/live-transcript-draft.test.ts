import type { LiveCorrectionBatch, LiveCorrectionEvent } from "@arc/shared/meeting-live-correction";
// oxlint-disable max-lines, promise/avoid-new, promise/prefer-await-to-callbacks, unicorn/consistent-function-scoping -- This state-machine suite intentionally stays together; deferred provider callbacks and local deterministic schedulers are the behavior under test.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveTranscriptDraft,
  createDurableLiveTranscriptDraft,
} from "./live-transcript-draft";
import { meetingLiveTranscriptDraftSchema } from "@arc/shared/meeting-transcription";
import type {
  LiveTranscriptConnection,
  LiveTranscriptEvent,
  LiveTranscriptPcmTap,
} from "./live-transcript-draft";

const CAPTURE_ID = "00000000-0000-4000-8000-000000000077";

afterEach(() => vi.restoreAllMocks());

describe("Live Transcript Draft", () => {
  it("waits for transcript-wide idle before forcing a trailing block", async () => {
    vi.useFakeTimers();
    const events = new Map<string, (event: LiveTranscriptEvent) => void>();
    const correct = vi.fn<(batch: LiveCorrectionBatch) => boolean>().mockReturnValue(true);
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: "temp",
          expiresAt: "2099-01-01T00:00:00Z",
          model: "qwen-audio-3.0-asr-flash-streaming",
          provider: "qwen",
          track,
        }),
      connect: ({ authorization, onTranscript }) => {
        events.set(authorization.track, onTranscript);
        return Promise.resolve({ close: vi.fn(), correct, sendPcm: () => true });
      },
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
    });

    try {
      // SAFETY: This test never accesses media track properties.
      await draft.start({
        captureId: CAPTURE_ID,
        tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
      });
      const mic = events.get("microphone");
      mic?.({ itemId: "1", text: "第一句还需要后文", type: "completed" });

      await vi.advanceTimersByTimeAsync(3999);
      expect(correct).not.toHaveBeenCalled();

      mic?.({ itemId: "2", text: "下一句正在说", type: "snapshot" });
      await vi.advanceTimersByTimeAsync(1);
      expect(correct).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3999);
      expect(correct).toHaveBeenCalledOnce();
      expect(correct).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: [expect.objectContaining({ originalText: "第一句还需要后文" })],
          lookahead: expect.objectContaining({ originalText: "下一句正在说" }),
        }),
      );
    } finally {
      draft.stop();
      vi.useRealTimers();
    }
  });

  it("waits for lookahead before sending a cross-track batch, atomically applies and cancels on pause", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const events = new Map<string, (event: LiveTranscriptEvent) => void>();
    const results = new Map<string, (event: LiveCorrectionEvent) => void>();
    const correct = vi.fn<(batch: LiveCorrectionBatch) => boolean>().mockReturnValue(true);
    let flushTrailingCorrections = () => {};
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: "temp",
          expiresAt: "2099-01-01T00:00:00Z",
          model: "qwen-audio-3.0-asr-flash-streaming",
          provider: "qwen",
          track,
        }),
      connect: ({ authorization, onTranscript, onCorrection }) => {
        events.set(authorization.track, onTranscript);
        results.set(authorization.track, onCorrection);
        return Promise.resolve({ close: vi.fn(), correct, sendPcm: () => true });
      },
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      scheduleCorrectionLookahead: (callback) => {
        flushTrailingCorrections = callback;
        return () => {
          if (flushTrailingCorrections === callback) {
            flushTrailingCorrections = () => {};
          }
        };
      },
    });
    // SAFETY: This test never accesses media track properties.
    await draft.start({
      captureId: CAPTURE_ID,
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    const emit = (track: string, event: LiveTranscriptEvent) => events.get(track)?.(event);
    const mic = events.get("microphone");
    const system = events.get("system");
    mic?.({ itemId: "1", text: "第一块。第二句。", type: "completed" });
    system?.({ itemId: "1", text: "第二块", type: "completed" });
    mic?.({ itemId: "2", text: "第三块", type: "snapshot" });
    expect(correct).not.toHaveBeenCalled();
    mic?.({ itemId: "2", text: "第三块", type: "completed" });
    expect(correct).not.toHaveBeenCalled();
    const flushPromise = draft.flushCorrections();
    expect(correct).toHaveBeenCalledOnce();
    expect(draft.getSnapshot().turns.map((turn) => turn.correcting)).toEqual([true, true, true]);
    const [[first]] = correct.mock.calls;
    expect(first.blocks.map((block) => [block.track, block.itemId])).toEqual([
      ["microphone", "1"],
      ["system", "1"],
      ["microphone", "2"],
    ]);
    expect(createDurableLiveTranscriptDraft(draft.getSnapshot())?.turns[0]).not.toHaveProperty(
      "correcting",
    );
    const snapshots: string[][] = [];
    draft.observe((snapshot) => snapshots.push(snapshot.turns.map((turn) => turn.text)));
    const llmBlocks = first.blocks.map((block, index) => ({ id: block.id, text: `校正${index}` }));
    results.get("microphone")?.({
      batchId: first.batchId,
      blocks: llmBlocks,
      combinedTranscript: "完整合并音频识别",
      model: "asr+llm",
      status: "completed",
      type: "meeting.transcription.correction-batch",
    });
    await flushPromise;
    expect(snapshots.at(-1)).toEqual(["校正0", "校正1", "校正2"]);
    expect(snapshots).toHaveLength(2);
    expect(consoleInfo).toHaveBeenCalledWith(
      "[meeting-capture-renderer] Live transcript correction completed",
      {
        appliedBlocks: llmBlocks,
        batchId: first.batchId,
        combinedAsrTranscript: "完整合并音频识别",
        llmBlocks,
        model: "asr+llm",
      },
    );
    expect(
      draft
        .getSnapshot()
        .turns.every((turn) => !turn.correcting && turn.correctionModel === "asr+llm"),
    ).toBe(true);
    mic?.({ itemId: "2", text: "第三块", type: "completed" });
    expect(correct).toHaveBeenCalledOnce();
    for (const i of [3, 4, 5]) {
      mic?.({ itemId: String(i), text: `原文${i}`, type: "completed" });
    }
    flushTrailingCorrections();
    expect(correct).toHaveBeenCalledTimes(2);
    draft.pause();
    expect(draft.getSnapshot().turns.some((turn) => turn.correcting)).toBe(false);
    const [, [second]] = correct.mock.calls;
    results.get("microphone")?.({
      batchId: second.batchId,
      blocks: second.blocks.map((block) => ({ id: block.id, text: "迟到" })),
      combinedTranscript: "迟到的合并识别",
      model: "asr+llm",
      status: "completed",
      type: "meeting.transcription.correction-batch",
    });
    expect(draft.getSnapshot().turns.some((turn) => turn.text === "迟到")).toBe(false);
    await draft.resume();
    emit("microphone", { itemId: "1", text: "恢复一", type: "completed" });
    emit("system", { itemId: "1", text: "恢复二", type: "completed" });
    expect(correct).toHaveBeenCalledTimes(2);
    emit("microphone", { itemId: "2", text: "恢复三", type: "completed" });
    flushTrailingCorrections();
    expect(correct).toHaveBeenCalledTimes(3);
    const [[third]] = correct.mock.calls.slice(2);
    results.get("microphone")?.({
      batchId: third.batchId,
      status: "finished",
      type: "meeting.transcription.correction-batch",
    });
    expect(draft.getSnapshot().turns.some((turn) => turn.correcting)).toBe(false);
    for (const i of [3, 4, 5]) {
      emit("microphone", { itemId: String(i), text: `新版${i}`, type: "completed" });
    }
    flushTrailingCorrections();
    const [[fourth]] = correct.mock.calls.slice(3);
    emit("microphone", { itemId: "3", text: "用户新版本", type: "completed" });
    results.get("microphone")?.({
      batchId: fourth.batchId,
      blocks: fourth.blocks.map((block) => ({ id: block.id, text: "不应回填" })),
      combinedTranscript: "不应回填的合并识别",
      model: "asr+llm",
      status: "completed",
      type: "meeting.transcription.correction-batch",
    });
    expect(
      draft
        .getSnapshot()
        .turns.slice(-3)
        .map((turn) => turn.text),
    ).toEqual(["用户新版本", "新版4", "新版5"]);
    expect(draft.getSnapshot().turns.some((turn) => turn.correcting)).toBe(false);
    correct.mockReturnValue(false);
    for (const i of [6, 7, 8]) {
      emit("microphone", { itemId: String(i), text: `离线${i}`, type: "completed" });
    }
    expect(draft.getSnapshot().turns.some((turn) => turn.correcting)).toBe(false);
    draft.stop();
  });

  it("replaces only an unchanged completed turn, persists its original, and ignores late events", async () => {
    const events = new Map<string, (event: LiveTranscriptEvent) => void>();
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: "temp",
          expiresAt: "2026-08-26T12:00:00Z",
          model: "qwen-audio-3.0-asr-flash-streaming",
          provider: "qwen",
          track,
        }),
      connect: ({ authorization, onTranscript }) => {
        events.set(authorization.track, onTranscript);
        return Promise.resolve({ close: vi.fn(), sendPcm: () => true });
      },
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
    });
    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: This test never accesses media track properties.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    const mic = events.get("microphone");
    const remote = events.get("system");
    if (!mic || !remote) {
      throw new Error("Missing track callback");
    }
    const correction: LiveTranscriptEvent = {
      correctionModel: "qwen-audio-3.0-asr-flash",
      itemId: "1",
      originalText: "库伯内提斯",
      text: "Kubernetes",
      type: "corrected",
    };
    const correcting: LiveTranscriptEvent = { ...correction, text: "", type: "correction-started" };
    mic({ itemId: "1", text: "库伯内提斯", type: "snapshot" });
    mic(correcting);
    expect(draft.getSnapshot().turns[0].correcting).toBeUndefined();
    mic(correction);
    expect(draft.getSnapshot().turns[0].text).toBe("库伯内提斯");
    mic({ itemId: "1", text: "库伯内提斯", type: "completed" });
    remote({ itemId: "1", text: "另一轨内容", type: "completed" });
    mic({ ...correcting, originalText: "旧版本" });
    mic({ ...correcting, itemId: "missing" });
    expect(draft.getSnapshot().turns.some((turn) => turn.correcting)).toBe(false);
    mic(correcting);
    expect(draft.getSnapshot().turns.map((turn) => Boolean(turn.correcting))).toEqual([
      true,
      false,
    ]);
    const inFlightDraft = meetingLiveTranscriptDraftSchema.parse(
      createDurableLiveTranscriptDraft(draft.getSnapshot()),
    );
    expect(inFlightDraft.turns[0]).not.toHaveProperty("correcting");
    mic({ ...correcting, type: "correction-finished" });
    expect(draft.getSnapshot().turns[0]).toMatchObject({ correcting: false, text: "库伯内提斯" });
    mic(correcting);
    mic({ itemId: "2", text: "正在说的新句子", type: "snapshot" });
    mic({ ...correction, originalText: "过期版本" });
    expect(draft.getSnapshot().turns[0].text).toBe("库伯内提斯");
    mic(correction);
    expect(draft.getSnapshot().turns[0].correcting).toBe(false);
    mic({ itemId: "1", text: "库伯内提斯", type: "completed" });
    mic({ ...correction, itemId: "missing" });
    expect(draft.getSnapshot().turns.map((turn) => turn.text)).toEqual([
      "Kubernetes",
      "另一轨内容",
      "正在说的新句子",
    ]);
    const durable = meetingLiveTranscriptDraftSchema.parse(
      createDurableLiveTranscriptDraft(draft.getSnapshot()),
    );
    expect(durable.turns[0]).toMatchObject({
      correctionModel: "qwen-audio-3.0-asr-flash",
      originalText: "库伯内提斯",
      text: "Kubernetes",
    });
    remote({ ...correcting, originalText: "另一轨内容" });
    expect(draft.getSnapshot().turns[1].correcting).toBe(true);
    draft.pause();
    remote({ ...correcting, originalText: "另一轨内容" });
    expect(draft.getSnapshot().turns[1].correcting).toBe(false);
    mic({ ...correction, itemId: "2", originalText: "正在说的新句子" });
    expect(draft.getSnapshot().turns[2].text).toBe("正在说的新句子");
    draft.stop();
    mic(correction);
    expect(draft.getSnapshot().turns).toEqual([]);
  });
  it("keeps durable turns when a recovered capture starts a new transcription segment", async () => {
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "qwen3-asr-flash-realtime",
          provider: "qwen",
          track,
        }),
      connect: () => Promise.resolve({ close: vi.fn(), sendPcm: vi.fn().mockReturnValue(true) }),
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
    });

    await draft.start({
      captureId: CAPTURE_ID,
      initialDraft: {
        capturedAt: "2026-08-09T01:10:00.000Z",
        droppedAudioMs: 0,
        droppedPcmFrames: 0,
        error: null,
        sections: [
          {
            id: `${CAPTURE_ID}:microphone:0`,
            sequence: 0,
            startedAt: "2026-08-09T01:00:00.000Z",
            track: "microphone",
          },
        ],
        turns: [
          {
            final: true,
            id: "old-turn",
            sectionId: `${CAPTURE_ID}:microphone:0`,
            text: "刷新前的字幕",
            track: "microphone",
          },
        ],
      },
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });

    expect(draft.getSnapshot().turns).toContainEqual(
      expect.objectContaining({ id: "old-turn", text: "刷新前的字幕" }),
    );
    expect(draft.getSnapshot().sections.map((section) => section.sequence)).toEqual([0, 1, 2]);
  });

  it("pauses provider resources while retaining turns, then opens new sections on resume", async () => {
    const connections: LiveTranscriptConnection[] = [];
    const taps: LiveTranscriptPcmTap[] = [];
    let flushTrailingCorrections = () => {};
    const release = vi.fn(() => Promise.resolve());
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "qwen3-asr-flash-realtime",
          provider: "qwen",
          track,
        }),
      connect: ({ authorization, onTranscript }) => {
        onTranscript({
          itemId: `item-${authorization.track}`,
          text: "保留的字幕",
          type: "completed",
        });
        if (authorization.track === "microphone") {
          onTranscript({ itemId: "second-mic", text: "第二个麦克风块", type: "completed" });
        }
        const connection = {
          close: vi.fn(),
          correct: vi.fn().mockReturnValue(true),
          sendPcm: vi.fn().mockReturnValue(true),
        };
        connections.push(connection);
        return Promise.resolve(connection);
      },
      createPcmTap: () => {
        const tap = { stop: vi.fn() };
        taps.push(tap);
        return Promise.resolve(tap);
      },
      release,
      scheduleCorrectionLookahead: (callback) => {
        flushTrailingCorrections = callback;
        return () => {
          if (flushTrailingCorrections === callback) {
            flushTrailingCorrections = () => {};
          }
        };
      },
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    const turnsBeforePause = draft
      .getSnapshot()
      .turns.map((turn) => ({ ...turn, correcting: false }));
    flushTrailingCorrections();
    expect(connections[0].correct).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([expect.objectContaining({ itemId: "item-system" })]),
      }),
    );
    expect(connections[1].correct).not.toHaveBeenCalled();
    draft.pause();

    expect(
      connections
        .slice(0, 2)
        .every((connection) => vi.mocked(connection.close).mock.calls.length === 1),
    ).toBe(true);
    expect(taps.slice(0, 2).every((tap) => vi.mocked(tap.stop).mock.calls.length === 1)).toBe(true);
    expect(draft.getSnapshot().turns).toEqual(turnsBeforePause);
    expect(release).toHaveBeenCalledWith(CAPTURE_ID);

    await draft.resume();

    expect(connections).toHaveLength(4);
    expect(taps).toHaveLength(4);
    expect(draft.getSnapshot().sections).toHaveLength(4);
    flushTrailingCorrections();
    expect(connections[2].correct).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([expect.objectContaining({ itemId: "item-system" })]),
      }),
    );
    expect(connections[3].correct).not.toHaveBeenCalled();
    draft.stop();
  });

  it("replaces cumulative provider snapshots instead of appending repeated prefixes", async () => {
    const events = new Map<"microphone" | "system", (event: LiveTranscriptEvent) => void>();
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "qwen3-asr-flash-realtime",
          provider: "qwen",
          track,
        }),
      connect: ({ authorization, onTranscript }) => {
        events.set(authorization.track, onTranscript);
        return Promise.resolve({ close: vi.fn(), sendPcm: vi.fn().mockReturnValue(true) });
      },
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    const onTranscript = events.get("microphone");
    onTranscript?.({ itemId: "item-1", text: "Thank", type: "snapshot" });
    onTranscript?.({ itemId: "item-1", text: "Thank you", type: "snapshot" });

    expect(draft.getSnapshot().turns).toEqual([
      expect.objectContaining({ final: false, text: "Thank you" }),
    ]);

    onTranscript?.({ itemId: "item-1", text: "Thank you.", type: "completed" });
    expect(draft.getSnapshot().turns).toEqual([
      expect.objectContaining({ final: true, text: "Thank you." }),
    ]);
  });

  it("keeps a bounded sidecar queue and treats provider backpressure as draft-only", async () => {
    const frameCallbacks = new Map<string, (frame: Int16Array) => void>();
    const writableCallbacks: (() => void)[] = [];
    const scheduled: (() => void)[] = [];
    const connection: LiveTranscriptConnection = {
      close: vi.fn(),
      sendPcm: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
    };
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "gpt-4o-mini-transcribe",
          provider: "openai",
          track,
        }),
      connect: ({ onWritable }) => {
        writableCallbacks.push(onWritable);
        return Promise.resolve(connection);
      },
      createPcmTap: ({ onFrame, track }) => {
        frameCallbacks.set(track, onFrame);
        return Promise.resolve({ stop: vi.fn() } satisfies LiveTranscriptPcmTap);
      },
      maxQueuedPcmBytesPerTrack: 8,
      reconnectDelayMs: 60_000,
      scheduleReconnect: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    frameCallbacks.get("microphone")?.(new Int16Array([1, 2, 3]));
    expect(draft.getSnapshot()).toMatchObject({
      droppedPcmFrames: 0,
      error: null,
      queuedPcmBytes: 6,
      status: "live",
    });

    frameCallbacks.get("microphone")?.(new Int16Array([4, 5, 6]));

    expect(draft.getSnapshot()).toMatchObject({
      captureId: CAPTURE_ID,
      droppedAudioMs: 0.125,
      droppedPcmFrames: 1,
      error: "实时字幕可能有遗漏，录音仍在继续",
      queuedPcmBytes: 6,
      status: "degraded",
    });
    expect(connection.close).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);

    writableCallbacks[0]?.();
    expect(draft.getSnapshot()).toMatchObject({
      droppedPcmFrames: 1,
      error: null,
      queuedPcmBytes: 0,
      status: "live",
    });
  });

  it("shows five seconds of queued audio as delayed and fully recovers on writable", async () => {
    const frameCallbacks = new Map<string, (frame: Int16Array) => void>();
    const writableCallbacks: (() => void)[] = [];
    let writable = false;
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "qwen3-asr-flash-realtime",
          provider: "qwen",
          track,
        }),
      connect: ({ onWritable }) => {
        writableCallbacks.push(onWritable);
        return Promise.resolve({ close: vi.fn(), sendPcm: vi.fn(() => writable) });
      },
      createPcmTap: ({ onFrame, track }) => {
        frameCallbacks.set(track, onFrame);
        return Promise.resolve({ stop: vi.fn() });
      },
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    for (let index = 0; index < 50; index += 1) {
      frameCallbacks.get("microphone")?.(new Int16Array(2400));
    }

    expect(draft.getSnapshot()).toMatchObject({
      droppedPcmFrames: 0,
      error: null,
      queuePeakAudioMs: 5000,
      queuedAudioMs: 5000,
      status: "buffering",
      trackQueuePeakAudioMs: { microphone: 5000, system: 0 },
      trackQueuedAudioMs: { microphone: 5000, system: 0 },
    });

    writable = true;
    writableCallbacks[0]?.();
    expect(draft.getSnapshot()).toMatchObject({ error: null, queuedAudioMs: 0, status: "live" });
  });

  it("creates a new section on reconnect without rewriting prior draft turns", async () => {
    const disconnects: ((reason: string) => void)[] = [];
    const events: ((event: LiveTranscriptEvent) => void)[] = [];
    const scheduled: (() => void)[] = [];
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "gpt-4o-mini-transcribe",
          provider: "openai",
          track,
        }),
      connect: ({ onDisconnect, onTranscript }) => {
        disconnects.push(onDisconnect);
        events.push(onTranscript);
        return Promise.resolve({ close: vi.fn(), sendPcm: vi.fn().mockReturnValue(true) });
      },
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      scheduleReconnect: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    events[0]?.({ itemId: "item-1", text: "第一段", type: "completed" });
    const originalTurn = { ...draft.getSnapshot().turns[0], correcting: false };
    const correcting: LiveTranscriptEvent = {
      itemId: "item-1",
      originalText: "第一段",
      text: "",
      type: "correction-started",
    };
    events[0]?.(correcting);
    expect(draft.getSnapshot().turns[0].correcting).toBe(true);
    disconnects[0]?.("network-lost");
    expect(draft.getSnapshot().status).toBe("interrupted");
    events[0]?.({ itemId: "item-1", text: "不应回写", type: "delta" });
    events[0]?.(correcting);
    expect(draft.getSnapshot().turns[0]).toEqual(originalTurn);

    scheduled[0]?.();
    await vi.waitFor(() => expect(draft.getSnapshot().sections.length).toBe(3));
    events[2]?.({ itemId: "item-1", text: "重连后的新段", type: "completed" });

    const snapshot = draft.getSnapshot();
    expect(snapshot.turns[0]).toEqual(originalTurn);
    expect(snapshot.turns[1]).toMatchObject({ text: "重连后的新段" });
    expect(snapshot.turns[0]?.sectionId).not.toBe(snapshot.turns[1]?.sectionId);
  });

  it("does not reset the retry budget for sessions that disconnect before any transcript", async () => {
    const sessions: {
      disconnect: (reason: string) => void;
      track: "microphone" | "system";
    }[] = [];
    const scheduled: { callback: () => void; delayMs: number }[] = [];
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "gpt-4o-mini-transcribe",
          provider: "openai",
          track,
        }),
      connect: ({ authorization, onDisconnect }) => {
        sessions.push({ disconnect: onDisconnect, track: authorization.track });
        return Promise.resolve({ close: vi.fn(), sendPcm: vi.fn().mockReturnValue(true) });
      },
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      maxReconnectAttempts: 2,
      random: () => 0.5,
      reconnectDelayMs: 100,
      scheduleReconnect: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return () => {};
      },
    });
    const microphoneSessions = () => sessions.filter(({ track }) => track === "microphone");

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    microphoneSessions().at(-1)?.disconnect("network-lost");
    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([100]);

    scheduled[0]?.callback();
    await vi.waitFor(() => expect(microphoneSessions()).toHaveLength(2));
    microphoneSessions().at(-1)?.disconnect("network-lost");
    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([100, 200]);

    scheduled[1]?.callback();
    await vi.waitFor(() => expect(microphoneSessions()).toHaveLength(3));
    microphoneSessions().at(-1)?.disconnect("network-lost");
    expect(scheduled).toHaveLength(2);
    expect(draft.getSnapshot().trackStatus.microphone).toBe("interrupted");
  });

  it("stops PCM taps that finish starting after the draft has stopped", async () => {
    const tapStops = [vi.fn(), vi.fn()];
    const resolveTaps: ((tap: LiveTranscriptPcmTap) => void)[] = [];
    const draft = createLiveTranscriptDraft({
      authorize: vi.fn(),
      connect: vi.fn(),
      createPcmTap: () =>
        new Promise((resolve) => {
          resolveTaps.push(resolve);
        }),
    });

    const starting = draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    await vi.waitFor(() => expect(resolveTaps).toHaveLength(2));
    draft.stop();
    for (const [index, resolve] of resolveTaps.entries()) {
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      resolve({ stop: tapStops[index] as () => void });
    }
    await starting;

    expect(tapStops[0]).toHaveBeenCalledOnce();
    expect(tapStops[1]).toHaveBeenCalledOnce();
    expect(draft.getSnapshot().status).toBe("idle");
  });

  it("releases a lease claimed by an authorization that completes after stop", async () => {
    const authorizationResolvers: ((track: "microphone" | "system") => void)[] = [];
    const release = vi.fn(() => Promise.resolve());
    const draft = createLiveTranscriptDraft({
      authorize: () =>
        new Promise((resolve) => {
          authorizationResolvers.push((resolvedTrack) =>
            resolve({
              clientSecret: `secret-${resolvedTrack}`,
              expiresAt: "2026-08-09T01:21:00.000Z",
              model: "gpt-4o-mini-transcribe",
              provider: "openai",
              track: resolvedTrack,
            }),
          );
        }),
      connect: vi.fn(),
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      release,
    });

    const starting = draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    await vi.waitFor(() => expect(authorizationResolvers).toHaveLength(2));
    draft.stop();
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    authorizationResolvers[0]?.("microphone");
    authorizationResolvers[1]?.("system");
    await starting;

    await vi.waitFor(() => expect(release.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(release).toHaveBeenCalledWith(CAPTURE_ID);
  });

  it("does not retry terminal authorization failures", async () => {
    const scheduled: (() => void)[] = [];
    const draft = createLiveTranscriptDraft({
      authorize: () => Promise.reject(new Error("provider disabled")),
      connect: vi.fn(),
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      scheduleReconnect: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
      shouldReconnect: () => false,
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });

    expect(draft.getSnapshot().status).toBe("interrupted");
    expect(scheduled).toHaveLength(0);
  });

  it("shows capacity rejection without claiming the local recording stopped", async () => {
    const release = vi.fn(() => Promise.resolve());
    const draft = createLiveTranscriptDraft({
      authorizationFailureReason: () => "capacity",
      authorize: () => Promise.reject(new Error("capacity")),
      connect: vi.fn(),
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      release,
      shouldReconnect: () => false,
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });

    expect(draft.getSnapshot()).toMatchObject({
      error: "实时字幕容量已满，录制仍在本地继续",
      status: "interrupted",
    });
    await vi.waitFor(() => expect(release).toHaveBeenCalledWith(CAPTURE_ID));
  });

  it("renews the capture lease while live and releases it on stop", async () => {
    const heartbeat = vi.fn().mockResolvedValue(true);
    const release = vi.fn(() => Promise.resolve());
    const scheduled: (() => void)[] = [];
    const draft = createLiveTranscriptDraft({
      authorize: ({ track }) =>
        Promise.resolve({
          clientSecret: `secret-${track}`,
          expiresAt: "2026-08-09T01:21:00.000Z",
          model: "gpt-4o-mini-transcribe",
          provider: "openai",
          track,
        }),
      connect: () => Promise.resolve({ close: vi.fn(), sendPcm: vi.fn().mockReturnValue(true) }),
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      heartbeat,
      release,
      scheduleLeaseHeartbeat: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    scheduled[0]?.();
    await vi.waitFor(() => expect(heartbeat).toHaveBeenCalledWith(CAPTURE_ID));
    draft.stop();
    await vi.waitFor(() => expect(release).toHaveBeenCalledWith(CAPTURE_ID));
  });

  it("backs off transient failures and stops after a bounded attempt count", async () => {
    const scheduled: { callback: () => void; delayMs: number }[] = [];
    const draft = createLiveTranscriptDraft({
      authorize: () => Promise.reject(new Error("network unavailable")),
      connect: vi.fn(),
      createPcmTap: () => Promise.resolve({ stop: vi.fn() }),
      maxReconnectAttempts: 2,
      random: () => 0.5,
      reconnectDelayMs: 100,
      scheduleReconnect: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return () => {};
      },
    });

    await draft.start({
      captureId: CAPTURE_ID,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual([100, 100]);

    scheduled[0]?.callback();
    await vi.waitFor(() => expect(scheduled).toHaveLength(3));
    expect(scheduled[2]?.delayMs).toBe(200);
    scheduled[2]?.callback();
    await vi.waitFor(() => expect(draft.getSnapshot().trackStatus.microphone).toBe("interrupted"));
    expect(scheduled).toHaveLength(3);
  });
});
