import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMeetingCapture } from "../../preload/meeting-capture";
import type {
  CaptureSink,
  MeetingCaptureSnapshot,
  MeetingRecordingStore,
  PreparedCapture,
} from "../../preload/meeting-capture";
import { LocalMeetingRecordingStore } from "./local-meeting-recording-store";

class DeterministicCaptureSource {
  private sink: CaptureSink | null = null;

  acquire(): Promise<PreparedCapture> {
    const prepared: PreparedCapture = {
      dispose: () => Promise.resolve(),
      start: (sink: CaptureSink) => {
        this.sink = sink;
        return Promise.resolve();
      },
      stop: () => Promise.resolve(),
      trackContentTypes: {
        microphone: "audio/webm;codecs=opus",
        system: "audio/webm;codecs=opus",
      },
      videoTracksDiscarded: 1,
    };
    return Promise.resolve(prepared);
  }

  async fragment(track: "microphone" | "system", sequence: number, payload: string | Uint8Array) {
    await this.sink?.fragment({
      bytes: typeof payload === "string" ? new TextEncoder().encode(payload) : payload,
      durationMs: 15_000,
      endedAtMonotonicMs: (sequence + 1) * 15_000,
      sequence,
      startedAtMonotonicMs: sequence * 15_000,
      track,
    });
  }

  level(track: "microphone" | "system", level: number) {
    this.sink?.level({ level, track });
  }

  status(track: "microphone" | "system", health: "ended" | "muted") {
    this.sink?.status({ health, track });
  }
}

function createDelayedDiscardStore(root: string): {
  finishDiscard: () => void;
  store: MeetingRecordingStore;
} {
  const delegate = new LocalMeetingRecordingStore(root);
  const gate = Promise.withResolvers<null>();
  return {
    finishDiscard: () => gate.resolve(null),
    store: {
      append: (input, bytes) => delegate.append(input, bytes),
      begin: (input) => delegate.begin(input),
      discard: async (captureId) => {
        await gate.promise;
        await delegate.discard(captureId);
      },
      recover: () => delegate.recover(),
      save: (captureId) => delegate.save(captureId),
    },
  };
}

function latestSnapshot(capture: ReturnType<typeof createMeetingCapture>) {
  let latest: MeetingCaptureSnapshot | null = null;
  const unsubscribe = capture.observe((snapshot) => {
    latest = snapshot;
  });
  return {
    read: () => latest as MeetingCaptureSnapshot,
    unsubscribe,
  };
}

async function waitFor(
  read: () => MeetingCaptureSnapshot,
  predicate: (snapshot: MeetingCaptureSnapshot) => boolean,
) {
  await vi.waitFor(() => expect(predicate(read())).toBe(true));
}

describe("MeetingCapture", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "meeting-capture-test-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(root, { force: true, recursive: true });
  });

  it("starts one local dual-track capture, diagnoses system silence, then discards it", async () => {
    vi.useFakeTimers();
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000001",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(capture);

    await capture.start({ recruitingRecordId: null });

    expect(observed.read()).toMatchObject({
      active: {
        captureId: "00000000-0000-4000-8000-000000000001",
        recruitingRecordId: null,
        tracks: {
          microphone: { health: "checking", level: 0 },
          system: { health: "checking", level: 0 },
        },
        videoTracksPersisted: 0,
      },
      phase: "active",
    });
    await expect(capture.start()).rejects.toThrow("已有会议正在录制");

    await vi.advanceTimersByTimeAsync(6000);
    expect(observed.read().active?.tracks.system.health).toBe("silent");
    source.level("system", 0.2);
    expect(observed.read().active?.tracks.system).toMatchObject({
      health: "healthy",
      level: 0.2,
    });
    source.status("microphone", "muted");
    expect(observed.read().active?.tracks.microphone.health).toBe("muted");

    await capture.discard();

    expect(observed.read()).toMatchObject({ active: null, phase: "idle", recoverable: [] });
    observed.unsubscribe();

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const afterRestart = latestSnapshot(restarted);
    await waitFor(afterRestart.read, (snapshot) => snapshot.recoveryComplete);
    expect(afterRestart.read().recoverable).toEqual([]);
  });

  it("saves ordered MediaRecorder streams idempotently and can explicitly discard the pending save", async () => {
    // MediaRecorder's first WebM timeslice carries the EBML header while later
    // timeslices commonly begin with a Cluster and are not standalone files.
    const headeredWebmFragment = Uint8Array.from([26, 69, 223, 163, 159]);
    const headerlessWebmContinuation = Uint8Array.from([31, 67, 182, 117, 129]);
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000002",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(capture);
    await capture.start({ recruitingRecordId: "resume-1" });
    await source.fragment("microphone", 0, headeredWebmFragment);
    await source.fragment("system", 0, headeredWebmFragment);
    await source.fragment("microphone", 1, headerlessWebmContinuation);
    await source.fragment("system", 1, headerlessWebmContinuation);

    const saved = await capture.save();
    const repeated = await capture.save();

    expect(repeated).toEqual(saved);
    expect(saved).toMatchObject({
      captureId: "00000000-0000-4000-8000-000000000002",
      container: {
        independentlyDecodableFragments: false,
        kind: "ordered-mediarecorder-stream",
      },
      recruitingRecordId: "resume-1",
      status: "saved-local",
      tracks: {
        microphone: { committedThroughMs: 30_000, fragmentCount: 2 },
        system: { committedThroughMs: 30_000, fragmentCount: 2 },
      },
    });
    expect(observed.read()).toMatchObject({ active: null, phase: "saved-local", saved });
    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const afterRestart = latestSnapshot(restarted);
    await waitFor(
      afterRestart.read,
      (snapshot) => snapshot.recoverable[0]?.status === "saved-local",
    );
    await expect(restarted.save({ captureId: saved.captureId })).resolves.toEqual(saved);

    await restarted.discard({ captureId: saved.captureId, includeSaved: true });
    expect(afterRestart.read()).toMatchObject({ phase: "idle", saved: null });
  });

  it("recovers a verified contiguous prefix after an interrupted capture", async () => {
    const source = new DeterministicCaptureSource();
    const firstProcess = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000003",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await firstProcess.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");
    await source.fragment("microphone", 1, "mic-1");

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(restarted);
    await waitFor(observed.read, (snapshot) => snapshot.recoverable.length === 1);

    expect(observed.read().recoverable[0]).toMatchObject({
      captureId: "00000000-0000-4000-8000-000000000003",
      possibleTailGap: true,
      status: "interrupted",
      tracks: {
        microphone: { committedThroughMs: 30_000, fragmentCount: 2 },
        system: { committedThroughMs: 15_000, fragmentCount: 1 },
      },
    });

    const saved = await restarted.save({
      captureId: "00000000-0000-4000-8000-000000000003",
    });
    expect(saved).toMatchObject({ possibleTailGap: true, status: "saved-local" });
    expect(observed.read().recoverable).toEqual([]);
  });

  it("makes a concurrent Save/Discard race deterministic", async () => {
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await capture.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");

    const saving = capture.save();
    await expect(capture.discard()).rejects.toThrow("正在保存，不能同时放弃录制");
    await expect(saving).resolves.toMatchObject({ status: "saved-local" });
  });

  it("lets Discard win deterministically when it starts before Save", async () => {
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await capture.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");

    const discarding = capture.discard();
    await expect(capture.save()).rejects.toThrow("正在放弃录制，不能同时保存");
    await discarding;

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(restarted);
    await waitFor(observed.read, (snapshot) => snapshot.recoveryComplete);
    expect(observed.read().recoverable).toEqual([]);
  });

  it("does not start a new capture while a saved recording is being discarded", async () => {
    const source = new DeterministicCaptureSource();
    const { finishDiscard, store } = createDelayedDiscardStore(root);
    const capture = createMeetingCapture({ source, store });
    await capture.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");
    const saved = await capture.save();

    const discarding = capture.discard({ captureId: saved.captureId, includeSaved: true });
    await expect(capture.start()).rejects.toThrow("已有会议正在录制");
    finishDiscard();
    await discarding;

    await expect(capture.start()).resolves.toBeUndefined();
  });

  it("keeps both pending local saves manageable across consecutive recordings", async () => {
    const captureIds = [
      "00000000-0000-4000-8000-000000000009",
      "00000000-0000-4000-8000-000000000010",
    ];
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => captureIds.shift() ?? "unexpected",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(capture);

    await capture.start();
    await source.fragment("microphone", 0, "first-mic");
    const first = await capture.save();
    await capture.start();
    await source.fragment("microphone", 0, "second-mic");
    const second = await capture.save();

    expect(observed.read()).toMatchObject({
      recoverable: [{ captureId: first.captureId, status: "saved-local" }],
      saved: { captureId: second.captureId },
    });
    await capture.discard({ captureId: first.captureId, includeSaved: true });
    expect(observed.read()).toMatchObject({
      recoverable: [],
      saved: { captureId: second.captureId },
    });
    await capture.discard({ captureId: second.captureId, includeSaved: true });
    expect(observed.read()).toMatchObject({ recoverable: [], saved: null });
  });

  it("persists a verified prefix when an interrupted recording later loses its tail", async () => {
    const captureId = "00000000-0000-4000-8000-000000000006";
    const source = new DeterministicCaptureSource();
    const firstProcess = createMeetingCapture({
      idFactory: () => captureId,
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await firstProcess.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");
    await source.fragment("microphone", 1, "mic-1");

    const firstRestart = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const firstRecovery = latestSnapshot(firstRestart);
    await waitFor(firstRecovery.read, (snapshot) => snapshot.recoveryComplete);

    await rm(join(root, "captures", captureId, "fragments", "microphone", "00000001.webm"));
    const secondRestart = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const secondRecovery = latestSnapshot(secondRestart);
    await waitFor(secondRecovery.read, (snapshot) => snapshot.recoveryComplete);
    expect(secondRecovery.read().recoverable[0]).toMatchObject({
      possibleTailGap: true,
      tracks: { microphone: { committedThroughMs: 15_000, fragmentCount: 1 } },
    });

    await expect(secondRestart.save({ captureId })).resolves.toMatchObject({
      possibleTailGap: true,
      tracks: { microphone: { committedThroughMs: 15_000, fragmentCount: 1 } },
    });
  });

  it("reconciles orphan and saved stale profile locks during startup", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "active-capture.lock"), "00000000-0000-4000-8000-000000000099");
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000004",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await capture.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");
    const saved = await capture.save();

    await writeFile(join(root, "active-capture.lock"), saved.captureId);
    const nextSource = new DeterministicCaptureSource();
    const restarted = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000005",
      source: nextSource,
      store: new LocalMeetingRecordingStore(root),
    });
    await restarted.start();
    const observed = latestSnapshot(restarted);
    expect(observed.read()).toMatchObject({
      active: { captureId: "00000000-0000-4000-8000-000000000005" },
      recoverable: [{ captureId: saved.captureId, status: "saved-local" }],
    });
  });

  it("continues recovery when another capture directory has no manifest", async () => {
    const validCaptureId = "00000000-0000-4000-8000-000000000007";
    const source = new DeterministicCaptureSource();
    const firstProcess = createMeetingCapture({
      idFactory: () => validCaptureId,
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await firstProcess.start();
    await source.fragment("microphone", 0, "mic-0");
    await mkdir(join(root, "captures", "00000000-0000-4000-8000-000000000008"), {
      recursive: true,
    });
    const malformedCaptureId = "00000000-0000-4000-8000-000000000011";
    await mkdir(join(root, "captures", malformedCaptureId), { recursive: true });
    await writeFile(
      join(root, "captures", malformedCaptureId, "manifest.json"),
      JSON.stringify({
        captureId: malformedCaptureId,
        fragments: [],
        manifestVersion: 1,
        status: "interrupted",
      }),
    );

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(restarted);
    await waitFor(observed.read, (snapshot) => snapshot.recoveryComplete);
    expect(observed.read().recoverable).toMatchObject([
      { captureId: validCaptureId, status: "interrupted" },
    ]);
  });
});
