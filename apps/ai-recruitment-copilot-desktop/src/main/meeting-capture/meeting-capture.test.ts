/* oxlint-disable max-lines -- state-machine restart regressions intentionally share the real store fixture. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMeetingCapture } from "../../preload/meeting-capture";
import type {
  CaptureSink,
  MeetingCaptureSnapshot,
  MeetingRecordingStore,
  PreparedCapture,
  WorkspaceRecordingPort,
} from "../../preload/meeting-capture";
import { LocalMeetingRecordingStore } from "./local-meeting-recording-store";

class DeterministicCaptureSource {
  private sink: CaptureSink | null = null;
  readonly pause = vi.fn(() => Promise.resolve());
  readonly resume = vi.fn(() => Promise.resolve());

  acquire(): Promise<PreparedCapture> {
    const prepared: PreparedCapture = {
      dispose: () => Promise.resolve(),
      pause: this.pause,
      resume: this.resume,
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
      markWorkspaceVerified: (captureId, recoveryCopyDeleteAfter) =>
        delegate.markWorkspaceVerified(captureId, recoveryCopyDeleteAfter),
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
    await expect(capture.start()).rejects.toThrow("已有录制正在进行");

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

  it("pauses and resumes one active capture without ending its local session", async () => {
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000091",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(capture);

    await capture.start();
    await capture.pause();

    expect(source.pause).toHaveBeenCalledOnce();
    expect(observed.read()).toMatchObject({
      active: { captureId: "00000000-0000-4000-8000-000000000091" },
      phase: "paused",
    });

    await capture.resume();

    expect(source.resume).toHaveBeenCalledOnce();
    expect(observed.read()).toMatchObject({
      active: { captureId: "00000000-0000-4000-8000-000000000091" },
      phase: "active",
    });
    await capture.discard();
  });

  it("stops at the four-hour boundary and durably saves committed audio", async () => {
    vi.useFakeTimers();
    const source = new DeterministicCaptureSource();
    const diagnostics = vi.fn();
    const capture = createMeetingCapture({
      diagnostics,
      idFactory: () => "00000000-0000-4000-8000-000000000085",
      maxDurationMs: 1000,
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(capture);

    await capture.start();
    await source.fragment("microphone", 0, "mic-committed");
    await source.fragment("system", 0, "system-committed");
    await vi.advanceTimersByTimeAsync(1001);
    await waitFor(observed.read, (snapshot) => snapshot.phase === "saved-local");

    expect(observed.read()).toMatchObject({
      active: null,
      saved: {
        captureId: "00000000-0000-4000-8000-000000000085",
        tracks: {
          microphone: { committedThroughMs: 15_000, fragmentCount: 1 },
          system: { committedThroughMs: 15_000, fragmentCount: 1 },
        },
      },
    });
    expect(diagnostics).toHaveBeenCalledWith({
      committedGapMs: 0,
      name: "meeting.capture.saved",
      spoolBytes: 29,
    });
    expect(JSON.stringify(diagnostics.mock.calls)).not.toContain("00000000-0000-4000");
    await expect(new LocalMeetingRecordingStore(root).recover()).resolves.toEqual([
      expect.objectContaining({
        captureId: "00000000-0000-4000-8000-000000000085",
        status: "saved-local",
      }),
    ]);
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
    expect(afterRestart.read()).toMatchObject({ localSessions: [], phase: "idle", saved: null });
  });

  it("persists only after local Save and keeps repeated Save idempotent", async () => {
    const source = new DeterministicCaptureSource();
    const persist = vi.fn<WorkspaceRecordingPort["persist"]>(({ report }) => {
      report("uploading");
      report("verifying");
      return Promise.resolve({ recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z" });
    });
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000012",
      source,
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(capture);

    await capture.start();
    expect(persist).not.toHaveBeenCalled();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");

    const saved = await capture.save();
    await capture.save();
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "workspace-verified",
    );

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: saved.captureId,
        manifestSha256: saved.manifestSha256,
      }),
    );
  });

  it("keeps a verified local row until the remote session is visible, then cleans it", async () => {
    const captureId = "00000000-0000-4000-8000-000000000084";
    const source = new DeterministicCaptureSource();
    const reportRecoveryCopyCleanup = vi.fn(async () => {});
    const firstProcess = createMeetingCapture({
      idFactory: () => captureId,
      source,
      store: new LocalMeetingRecordingStore(root),
      workspace: {
        persist: () => Promise.resolve({ recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z" }),
        reportRecoveryCopyCleanup,
      },
    });
    const firstObserved = latestSnapshot(firstProcess);
    await firstProcess.start();
    await source.fragment("microphone", 0, "mic");
    await source.fragment("system", 0, "system");
    await firstProcess.save();
    await waitFor(
      firstObserved.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "workspace-verified",
    );

    expect(firstObserved.read().localSessions).toEqual([
      expect.objectContaining({ id: captureId, state: "workspace-verified" }),
    ]);
    expect(reportRecoveryCopyCleanup).not.toHaveBeenCalled();

    await firstProcess.acknowledgeRemoteVisibility(captureId);

    expect(firstObserved.read().localSessions).toEqual([]);
    expect(reportRecoveryCopyCleanup).toHaveBeenCalledWith(
      captureId,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      "deleted",
    );
    await expect(new LocalMeetingRecordingStore(root).recover()).resolves.toEqual([]);
  });

  it("streams complete logical tracks to object uploads without a combined renderer payload", async () => {
    const uploaded = new Map<string, Uint8Array>();
    const store = new LocalMeetingRecordingStore(root, {
      allowedUploadOrigin: "https://account.r2.cloudflarestorage.com",
      putObject: async ({ body, url }) => {
        const chunks: Uint8Array[] = [];
        const reader = body.getReader();
        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }
          chunks.push(result.value);
        }
        uploaded.set(url, Uint8Array.from(chunks.flatMap((chunk) => [...chunk])));
      },
    });
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000014",
      source,
      store,
    });
    await capture.start();
    await source.fragment("microphone", 0, "mic-a");
    await source.fragment("system", 0, "sys-a");
    await source.fragment("microphone", 1, "mic-b");
    await source.fragment("system", 1, "sys-b");
    const liveTranscriptDraft = {
      capturedAt: "2026-08-12T08:00:00.000Z",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      sections: [
        {
          id: "microphone-1",
          sequence: 0,
          startedAt: "2026-08-12T07:59:00.000Z",
          track: "microphone" as const,
        },
      ],
      turns: [
        {
          final: true,
          id: "microphone-1:turn-1",
          sectionId: "microphone-1",
          text: "这段实时字幕必须保留",
          track: "microphone" as const,
        },
      ],
    };
    const saved = await capture.save({ liveTranscriptDraft });
    const descriptor = await store.describeWorkspaceSave(saved.captureId);

    expect(descriptor.liveTranscriptDraft).toEqual(liveTranscriptDraft);

    await store.uploadSmall(
      saved.captureId,
      descriptor.assets.map((asset) => ({
        contentType: asset.contentType,
        expiresAt: "2026-08-09T03:10:00.000Z",
        headers: {
          "content-type": asset.contentType,
          "x-amz-checksum-sha256": Buffer.from(asset.sha256, "hex").toString("base64"),
          "x-amz-meta-sha256": asset.sha256,
        },
        method: "PUT",
        sizeBytes: asset.sizeBytes,
        track: asset.track,
        url: `https://bucket.account.r2.cloudflarestorage.com/${asset.track}`,
      })),
    );

    expect(
      new TextDecoder().decode(
        uploaded.get("https://bucket.account.r2.cloudflarestorage.com/microphone"),
      ),
    ).toBe("mic-amic-b");
    expect(
      new TextDecoder().decode(
        uploaded.get("https://bucket.account.r2.cloudflarestorage.com/system"),
      ),
    ).toBe("sys-asys-b");
    expect(descriptor.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sha256: createHash("sha256").update("mic-amic-b").digest("hex"),
          track: "microphone",
        }),
      ]),
    );

    await expect(
      store.uploadSmall(
        saved.captureId,
        descriptor.assets.map((asset) => ({
          contentType: asset.contentType,
          expiresAt: "2026-08-09T03:10:00.000Z",
          headers: {
            "content-type": asset.contentType,
            "x-amz-checksum-sha256": Buffer.from(asset.sha256, "hex").toString("base64"),
            "x-amz-meta-sha256": asset.sha256,
          },
          method: "PUT",
          sizeBytes: asset.sizeBytes,
          track: asset.track,
          url: `https://attacker.invalid/${asset.track}`,
        })),
      ),
    ).rejects.toThrow("不属于已配置的 Recording R2");
  });

  it("aggregates fixed multipart ranges across recording fragments and uploads only requested parts", async () => {
    const uploaded = new Map<string, Uint8Array>();
    let inFlight = 0;
    let maxInFlight = 0;
    const store = new LocalMeetingRecordingStore(root, {
      allowedUploadOrigin: "https://account.r2.cloudflarestorage.com",
      multipartPartSizeBytes: 8,
      putObject: async ({ body, url }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(5);
        const chunks: Uint8Array[] = [];
        const reader = body.getReader();
        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }
          chunks.push(result.value);
        }
        uploaded.set(url, Uint8Array.from(chunks.flatMap((chunk) => [...chunk])));
        inFlight -= 1;
      },
    });
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000015",
      source,
      store,
    });
    await capture.start();
    await source.fragment("microphone", 0, "abcde");
    await source.fragment("system", 0, "12345");
    await source.fragment("microphone", 1, "fghijklmnopqrstuvwxyzABCDEFGHIJKLMN");
    await source.fragment("system", 1, "fghijklmnopqrstuvwxyzABCDEFGHIJKLMN");
    const saved = await capture.save();

    const descriptor = await store.describeMultipartWorkspaceSave(saved.captureId);
    expect(descriptor.assets.find((asset) => asset.track === "microphone")?.parts[0]).toEqual({
      md5Base64: "6NxAgbE0NLRRiacgt3toGA==",
      offsetBytes: 0,
      partNumber: 1,
      sizeBytes: 8,
    });

    await store.uploadMultipart(saved.captureId, [
      {
        expiresAt: "2026-08-09T03:10:00.000Z",
        headers: { "content-md5": "6NxAgbE0NLRRiacgt3toGA==" },
        method: "PUT",
        offsetBytes: 0,
        partNumber: 1,
        sizeBytes: 8,
        track: "microphone",
        url: "https://bucket.account.r2.cloudflarestorage.com/microphone?partNumber=1",
      },
    ]);

    expect(uploaded.size).toBe(1);
    expect(
      new TextDecoder().decode(
        uploaded.get("https://bucket.account.r2.cloudflarestorage.com/microphone?partNumber=1"),
      ),
    ).toBe("abcdefgh");

    maxInFlight = 0;
    await store.uploadMultipart(
      saved.captureId,
      descriptor.assets.flatMap((asset) =>
        asset.parts.map(({ md5Base64, ...part }) => ({
          ...part,
          expiresAt: "2026-08-09T03:10:00.000Z",
          headers: { "content-md5": md5Base64 },
          method: "PUT" as const,
          track: asset.track,
          url: `https://bucket.account.r2.cloudflarestorage.com/${asset.track}?partNumber=${part.partNumber}`,
        })),
      ),
    );
    expect(maxInFlight).toBe(4);
  });

  it("retains an action-required local save and retries it on repeated Save", async () => {
    const source = new DeterministicCaptureSource();
    const persist = vi
      .fn<WorkspaceRecordingPort["persist"]>()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockImplementationOnce(({ report }) => {
        report("uploading");
        report("verifying");
        return Promise.resolve({ recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z" });
      });
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000013",
      source,
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(capture);

    await capture.start();
    await source.fragment("microphone", 0, "mic-0");
    await source.fragment("system", 0, "system-0");
    await capture.save();
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "action-required",
    );

    expect(observed.read().workspaceSaves[0]?.error).toBe("network unavailable");
    await capture.save();
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "workspace-verified",
    );
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("retries a completed local save on restart and deletes the local copy last", async () => {
    const source = new DeterministicCaptureSource();
    const first = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000016",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await first.start();
    await source.fragment("microphone", 0, "mic");
    await source.fragment("system", 0, "system");
    const saved = await first.save();
    const persist = vi.fn<WorkspaceRecordingPort["persist"]>(() =>
      Promise.resolve({ recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z" }),
    );

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(restarted);
    await waitFor(observed.read, (snapshot) => snapshot.recoveryComplete);
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "workspace-verified",
    );

    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: saved.captureId,
        manifestSha256: saved.manifestSha256,
      }),
    );
    expect(observed.read().localSessions).toEqual([
      expect.objectContaining({ id: saved.captureId, state: "workspace-verified" }),
    ]);

    await restarted.acknowledgeRemoteVisibility(saved.captureId);

    expect(observed.read().localSessions).toEqual([]);
    await expect(new LocalMeetingRecordingStore(root).recover()).resolves.toEqual([]);
  });

  it("keeps a completed local copy when its startup upload retry fails", async () => {
    const source = new DeterministicCaptureSource();
    const first = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000096",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await first.start();
    await source.fragment("microphone", 0, "mic");
    await source.fragment("system", 0, "system");
    const saved = await first.save();
    const persist = vi
      .fn<WorkspaceRecordingPort["persist"]>()
      .mockRejectedValue(new Error("network unavailable"));

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(restarted);
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "action-required",
    );

    expect(observed.read().localSessions).toEqual([
      expect.objectContaining({ id: saved.captureId, state: "sync-failed" }),
    ]);
    await expect(new LocalMeetingRecordingStore(root).recover()).resolves.toEqual([
      expect.objectContaining({ captureId: saved.captureId, status: "saved-local" }),
    ]);
  });

  it("does not upload an interrupted local session during startup recovery", async () => {
    const captureId = "00000000-0000-4000-8000-000000000097";
    const source = new DeterministicCaptureSource();
    const first = createMeetingCapture({
      idFactory: () => captureId,
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await first.start();
    await source.fragment("microphone", 0, "mic");
    const persist = vi.fn<WorkspaceRecordingPort["persist"]>();

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(restarted);
    await waitFor(observed.read, (snapshot) => snapshot.recoveryComplete);

    expect(persist).not.toHaveBeenCalled();
    expect(observed.read().localSessions).toEqual([
      expect.objectContaining({ id: captureId, state: "interrupted" }),
    ]);
  });

  it("keeps an unfinished upload waiting when the workspace is not ready yet", async () => {
    const source = new DeterministicCaptureSource();
    const persist = vi
      .fn<WorkspaceRecordingPort["persist"]>()
      .mockRejectedValueOnce(new Error("请先加入或选择一个工作区"))
      .mockImplementationOnce(() =>
        Promise.resolve({ recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z" }),
      );
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000098",
      source,
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(capture);

    await capture.start();
    await source.fragment("microphone", 0, "mic");
    await source.fragment("system", 0, "system");
    await capture.save();
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "waiting-for-network",
    );

    expect(observed.read().workspaceSaves[0]?.error).toBeNull();
    capture.retryPendingWorkspaceSaves();
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "workspace-verified",
    );
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("retries unfinished saved-local uploads after a failed startup persist", async () => {
    const source = new DeterministicCaptureSource();
    const first = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000099",
      source,
      store: new LocalMeetingRecordingStore(root),
    });
    await first.start();
    await source.fragment("microphone", 0, "mic");
    await source.fragment("system", 0, "system");
    const saved = await first.save();
    const persist = vi
      .fn<WorkspaceRecordingPort["persist"]>()
      .mockRejectedValueOnce(new Error("请先加入或选择一个工作区"))
      .mockImplementationOnce(() =>
        Promise.resolve({ recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z" }),
      );

    const restarted = createMeetingCapture({
      source: new DeterministicCaptureSource(),
      store: new LocalMeetingRecordingStore(root),
      workspace: { persist },
    });
    const observed = latestSnapshot(restarted);
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "waiting-for-network",
    );

    restarted.retryPendingWorkspaceSaves();
    await waitFor(
      observed.read,
      (snapshot) => snapshot.workspaceSaves[0]?.state === "workspace-verified",
    );
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: saved.captureId,
        manifestSha256: saved.manifestSha256,
      }),
    );
  });

  it("cleans only server-verified recovery copies after their durable deadline", async () => {
    const firstSource = new DeterministicCaptureSource();
    const store = new LocalMeetingRecordingStore(root);
    const first = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000017",
      source: firstSource,
      store,
    });
    await first.start();
    await firstSource.fragment("microphone", 0, "mic-one");
    await firstSource.fragment("system", 0, "sys-one");
    const verified = await first.save();
    await store.markWorkspaceVerified(verified.captureId, "2030-08-10T03:00:00.000Z");

    const secondSource = new DeterministicCaptureSource();
    const second = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000018",
      source: secondSource,
      store,
    });
    await second.start();
    await secondSource.fragment("microphone", 0, "mic-two");
    await secondSource.fragment("system", 0, "sys-two");
    const pending = await second.save();

    const beforeDeadline = await new LocalMeetingRecordingStore(root, {
      now: () => new Date("2030-08-10T02:59:59.000Z"),
    }).recover();
    expect(beforeDeadline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          captureId: verified.captureId,
          recoveryCopyDeleteAfter: "2030-08-10T03:00:00.000Z",
        }),
        expect.objectContaining({ captureId: pending.captureId }),
      ]),
    );

    const afterDeadline = await new LocalMeetingRecordingStore(root, {
      now: () => new Date("2030-08-10T03:00:01.000Z"),
    }).recover();
    expect(afterDeadline.map((capture) => capture.captureId)).toEqual([pending.captureId]);
  });

  it("removes a verified recovery copy after remote visibility is acknowledged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T03:00:00.000Z"));
    const source = new DeterministicCaptureSource();
    const capture = createMeetingCapture({
      idFactory: () => "00000000-0000-4000-8000-000000000019",
      source,
      store: new LocalMeetingRecordingStore(root),
      workspace: {
        persist: () => Promise.resolve({ recoveryCopyDeleteAfter: "2026-08-09T03:00:01.000Z" }),
      },
    });
    const observed = latestSnapshot(capture);
    await capture.start();
    await source.fragment("microphone", 0, "mic");
    await source.fragment("system", 0, "system");
    await capture.save();
    await vi.waitFor(() =>
      expect(observed.read().workspaceSaves[0]?.state).toBe("workspace-verified"),
    );

    await capture.acknowledgeRemoteVisibility("00000000-0000-4000-8000-000000000019");

    await vi.waitFor(() => expect(observed.read()).toMatchObject({ phase: "idle", saved: null }));
    expect(await new LocalMeetingRecordingStore(root).recover()).toEqual([]);
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
    await firstProcess.updateLocalSession("00000000-0000-4000-8000-000000000003", {
      liveTranscriptDraft: {
        capturedAt: "2026-08-09T01:00:30.000Z",
        droppedAudioMs: 0,
        droppedPcmFrames: 0,
        error: null,
        sections: [
          {
            id: "section-1",
            sequence: 0,
            startedAt: "2026-08-09T01:00:00.000Z",
            track: "microphone",
          },
        ],
        turns: [
          {
            final: true,
            id: "turn-1",
            sectionId: "section-1",
            text: "刷新后仍要保留的字幕",
            track: "microphone",
          },
        ],
      },
    });

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
    await expect(
      new LocalMeetingRecordingStore(root).describeWorkspaceSave(saved.captureId),
    ).resolves.toMatchObject({
      liveTranscriptDraft: { turns: [expect.objectContaining({ text: "刷新后仍要保留的字幕" })] },
    });
    expect(observed.read().recoverable).toEqual([]);
  });

  it("continues an interrupted capture with the same id and appends after its durable prefix", async () => {
    const captureId = "00000000-0000-4000-8000-000000000093";
    const firstSource = new DeterministicCaptureSource();
    const firstProcess = createMeetingCapture({
      idFactory: () => captureId,
      source: firstSource,
      store: new LocalMeetingRecordingStore(root),
    });
    await firstProcess.start();
    await firstSource.fragment("microphone", 0, "first-mic");
    await firstSource.fragment("system", 0, "first-system");

    const resumedSource = new DeterministicCaptureSource();
    const restarted = createMeetingCapture({
      source: resumedSource,
      store: new LocalMeetingRecordingStore(root),
    });
    const observed = latestSnapshot(restarted);
    await waitFor(observed.read, (snapshot) => snapshot.recoverable.length === 1);

    await restarted.continueInterrupted(captureId);
    expect(observed.read()).toMatchObject({
      active: { captureId },
      phase: "active",
      recoverable: [],
    });
    await resumedSource.fragment("microphone", 0, "second-mic");
    await resumedSource.fragment("system", 0, "second-system");
    const saved = await restarted.save({ captureId });

    expect(saved.tracks).toEqual({
      microphone: { bytes: 19, committedThroughMs: 30_000, fragmentCount: 2 },
      system: { bytes: 25, committedThroughMs: 30_000, fragmentCount: 2 },
    });
    expect(observed.read().localSessions[0]).toMatchObject({
      id: captureId,
      segmentCount: 2,
      state: "saved-local",
    });
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
    await expect(capture.start()).rejects.toThrow("已有录制正在进行");
    finishDiscard();
    await discarding;

    await expect(capture.start()).resolves.toEqual({
      captureId: expect.any(String),
    });
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
