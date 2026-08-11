// oxlint-disable promise/avoid-new, promise/prefer-await-to-callbacks -- Deferred provider callbacks are the behavior under test.
import { describe, expect, it, vi } from "vitest";
import { createLiveTranscriptDraft } from "./live-transcript-draft";
import type {
  LiveTranscriptConnection,
  LiveTranscriptEvent,
  LiveTranscriptPcmTap,
} from "./live-transcript-draft";

const CAPTURE_ID = "00000000-0000-4000-8000-000000000077";

describe("Live Transcript Draft", () => {
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
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    frameCallbacks.get("microphone")?.(new Int16Array([1, 2, 3]));
    frameCallbacks.get("microphone")?.(new Int16Array([4, 5, 6]));

    expect(draft.getSnapshot()).toMatchObject({
      captureId: CAPTURE_ID,
      droppedPcmFrames: 1,
      queuedPcmBytes: 6,
      status: "interrupted",
    });
    expect(connection.close).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);

    writableCallbacks[0]?.();
    expect(draft.getSnapshot()).toMatchObject({ queuedPcmBytes: 0, status: "live" });
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
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    events[0]?.({ itemId: "item-1", text: "第一段", type: "completed" });
    const [originalTurn] = draft.getSnapshot().turns;
    disconnects[0]?.("network-lost");
    expect(draft.getSnapshot().status).toBe("interrupted");
    events[0]?.({ itemId: "item-1", text: "不应回写", type: "delta" });
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
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });
    await vi.waitFor(() => expect(resolveTaps).toHaveLength(2));
    draft.stop();
    for (const [index, resolve] of resolveTaps.entries()) {
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
      tracks: { microphone: {} as MediaStreamTrack, system: {} as MediaStreamTrack },
    });

    expect(draft.getSnapshot()).toMatchObject({
      error: "实时字幕容量已满，Meeting Recording 仍在本地继续",
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
