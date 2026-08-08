import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMeetingCapture } from "../../preload/meeting-capture";
import type {
  CaptureSink,
  MeetingCaptureSnapshot,
  PreparedCapture,
} from "../../preload/meeting-capture";
import { LocalMeetingRecordingStore } from "./local-meeting-recording-store";

class DeterministicCaptureSource {
  private prepared: PreparedCapture | null = null;
  private sink: CaptureSink | null = null;

  acquire(): Promise<PreparedCapture> {
    const prepared: PreparedCapture = {
      dispose: vi.fn(async () => {}),
      start: vi.fn((sink: CaptureSink) => {
        this.sink = sink;
        return Promise.resolve();
      }),
      stop: vi.fn(async () => {}),
      trackContentTypes: {
        microphone: "audio/webm;codecs=opus",
        system: "audio/webm;codecs=opus",
      },
      videoTracksDiscarded: 1,
    };
    this.prepared = prepared;
    return Promise.resolve(prepared);
  }

  async fragment(track: "microphone" | "system", sequence: number, text: string) {
    await this.sink?.fragment({
      bytes: new TextEncoder().encode(text),
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

  get latestPrepared() {
    return this.prepared;
  }
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

    expect(source.latestPrepared?.dispose).toHaveBeenCalledOnce();
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
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000002",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(capture);
    await capture.start({ recruitingRecordId: "resume-1" });
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");
    await source.fragment("microphone", 1, "mic-1");
    await source.fragment("system", 1, "system-1");

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
        microphone: { committedThrough: 1, fragmentCount: 2 },
        system: { committedThrough: 1, fragmentCount: 2 },
      },
    });
    expect(observed.read()).toMatchObject({ active: null, phase: "saved-local", saved });
    expect(source.latestPrepared?.stop).toHaveBeenCalledOnce();

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
        microphone: { committedThrough: 1, fragmentCount: 2 },
        system: { committedThrough: 0, fragmentCount: 1 },
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
});
