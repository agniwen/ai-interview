import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  echoArtifactSchema,
  echoDeviceContextSchema,
  echoSubmitTranscriptionSchema,
  echoSyncIntelligenceSchema,
  echoSyncTranscriptSchema,
} from "@app/shared/meeting-device-processing";
import { DesktopDatabase } from "../database";
import { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import { EchoServerClient } from "./server-client";
import { MeetingTaskStore } from "./task-store";
import { createEchoProcessingHandlers, ECHO_PROCESSING_STEPS } from "./pipeline";
import { classifyMeetingTaskError } from "./task-error";
import { EchoProcessingService } from "./service";

const MEETING_ID = "00000000-0000-4000-8000-000000000801";
const DEVICE_ID = "00000000-0000-4000-8000-000000000802";
const STORAGE_ORIGIN = "https://recordings.example";
const summary = {
  actionItems: [],
  decisions: [],
  openQuestions: [],
  summary: "周五交付",
  template: "general",
  topics: [],
};
afterEach(() => vi.unstubAllGlobals());

it("reopens the real SQLite pipeline after lost upload ACK and Qwen submission, retains local output before independent sync, and releases only audio", async () => {
  if (!ffmpegPath) {
    throw new Error("FFmpeg unavailable");
  }
  const root = await mkdtemp(join(tmpdir(), "echo-pipeline-"));
  const databaseOptions = {
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path: join(root, "tasks.sqlite"),
  };
  let database = new DesktopDatabase(databaseOptions);
  let clock = Date.now();
  let tasks = new MeetingTaskStore(database, () => clock);
  const objects = new Map<string, Uint8Array>();
  const storageFetch: typeof fetch = vi.fn(async (url, options = {}) => {
    expect(String(url).startsWith(STORAGE_ORIGIN)).toBe(true);
    const bytes = new Uint8Array(await new Response(options?.body).arrayBuffer());
    const headers = new Headers(options.headers);
    expect(bytes.length).toBe(Number(headers.get("content-length")));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(headers.get("x-amz-meta-sha256"));
    objects.set(String(url), bytes);
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", storageFetch);
  const recordings = new LocalMeetingRecordingStore(join(root, "recordings"), {
    allowedUploadOrigin: STORAGE_ORIGIN,
  });
  await recordings.recover();
  try {
    await promisify(execFile)(ffmpegPath, [
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.5",
      "-c:a",
      "libopus",
      join(root, "source.webm"),
    ]);
    const bytes = await readFile(join(root, "source.webm"));
    await recordings.begin({
      captureId: MEETING_ID,
      recruitingRecordId: null,
      startedAt: "2026-09-09T00:00:00.000Z",
      trackContentTypes: { microphone: "audio/webm", system: "audio/webm" },
      videoTracksDiscarded: 0,
    });
    for (const track of ["microphone", "system"] as const) {
      await recordings.append(
        {
          captureId: MEETING_ID,
          contentType: "audio/webm",
          durationMs: 500,
          endedAtMonotonicMs: 500,
          sequence: 0,
          startedAtMonotonicMs: 0,
          track,
        },
        bytes,
      );
    }
    const saved = await recordings.save(MEETING_ID);
    const descriptor = await recordings.describeWorkspaceSave(MEETING_ID);
    const server = echoDeviceContextSchema.parse({
      accountId: "account",
      deviceId: DEVICE_ID,
      epoch: 1,
      intelligence: null,
      intelligenceModel: { model: "test-model", provider: "test-provider" },
      intelligenceRevisionId: null,
      liveSummary: null,
      liveTranscriptDraft: null,
      manifestSha256: saved.manifestSha256,
      meetingId: MEETING_ID,
      playbackReady: false,
      processingComplete: false,
      processingOwner: "device",
      recoveryCopyDeleteAfter: null,
      savedAt: saved.savedAt,
      sourceVerified: false,
      startedAt: descriptor.startedAt,
      suggestedTemplate: "general",
      title: "恢复测试",
      transcript: null,
      transcription: {
        languageHint: null,
        model: "qwen-test",
        pipelineVersion: "test-v1",
        provider: "qwen",
        region: "cn",
      },
    });
    let lostPoll = false;
    let intelligenceCalls = 0;
    let completeCalls = 0;
    const submissions = new Map<string, string>();
    const gateway: typeof fetch = vi.fn((url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("get-session")) {
        return Promise.resolve(Response.json({ user: { id: "account" } }));
      }
      const headers = new Headers(options.headers);
      expect(headers.get("X-Echo-Account-Id")).toBe("account");
      expect(headers.get("X-Echo-Workspace-Id")).toBe("workspace");
      expect(headers.get("X-Echo-Device-Id")).toBe(DEVICE_ID);
      expect(path.startsWith("/api/w/frozen-workspace/meetings")).toBe(true);
      const body: unknown = options.body ? JSON.parse(z.string().parse(options.body)) : {};
      let response: Response;
      if (path.endsWith("/meetings")) {
        response = Response.json({
          meetingId: MEETING_ID,
          recoveryCopyDeleteAfter: server.recoveryCopyDeleteAfter,
          state: server.sourceVerified ? "workspace-verified" : "uploading",
          uploads: server.sourceVerified
            ? []
            : descriptor.assets.map((asset) => ({
                ...asset,
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                headers: {
                  "content-type": asset.contentType,
                  "x-amz-checksum-sha256": Buffer.from(asset.sha256, "hex").toString("base64"),
                  "x-amz-meta-sha256": asset.sha256,
                },
                method: "PUT",
                url: `${STORAGE_ORIGIN}/${asset.track}`,
              })),
        });
      } else if (path.endsWith("/device")) {
        response = Response.json(server);
      } else if (path.endsWith("/complete")) {
        completeCalls += 1;
        expect(objects.has(`${STORAGE_ORIGIN}/microphone`)).toBe(true);
        expect(objects.has(`${STORAGE_ORIGIN}/system`)).toBe(true);
        server.sourceVerified = true;
        server.recoveryCopyDeleteAfter = new Date().toISOString();
        return Promise.reject(new Error("模拟云端已验证但响应丢失"));
      } else if (path.endsWith("/artifacts")) {
        const { artifact } = z.object({ artifact: echoArtifactSchema }).parse(body);
        response = Response.json({
          headers: {
            "content-type": artifact.contentType,
            "x-amz-checksum-sha256": Buffer.from(artifact.sha256, "hex").toString("base64"),
            "x-amz-meta-sha256": artifact.sha256,
          },
          method: "PUT",
          url: `${STORAGE_ORIGIN}/${artifact.artifactId}`,
        });
      } else if (path.endsWith("/transcription/submit")) {
        const submitted = echoSubmitTranscriptionSchema.parse(body);
        submissions.set(submitted.operationId, submitted.chunk.track);
        response = Response.json({ result: { taskId: submitted.operationId }, state: "complete" });
      } else if (path.endsWith("/transcription/poll")) {
        if (!lostPoll) {
          lostPoll = true;
          return Promise.reject(new Error("模拟提交成功后退出"));
        }
        const { submissionId } = z.object({ submissionId: z.string() }).parse(body);
        expect(submissions.has(submissionId)).toBe(true);
        response = Response.json({
          state: "ready",
          transcript: {
            language: "zh",
            turns: [
              {
                confidence: null,
                endMs: 400,
                speakerDisplayName: null,
                speakerKey: submissions.get(submissionId) === "system" ? "remote-1" : "local",
                startMs: 0,
                text: "周五交付",
                track: submissions.get(submissionId) === "system" ? "remote" : "local",
              },
            ],
          },
        });
      } else if (path.endsWith("/intelligence/step")) {
        intelligenceCalls += 1;
        response = Response.json({
          result: { content: summary, state: "ready" },
          state: "complete",
        });
      } else if (path.endsWith("/sync/transcript")) {
        const sync = echoSyncTranscriptSchema.parse(body);
        server.transcript = sync.transcript;
        response = Response.json({
          result: { revisionId: sync.transcript.revisionId },
          state: "complete",
        });
      } else if (path.endsWith("/sync/intelligence")) {
        const sync = echoSyncIntelligenceSchema.parse(body);
        expect(sync.transcriptRevisionId).toBe(server.transcript?.revisionId);
        server.intelligence = sync.content;
        response = Response.json({ result: { revisionId: sync.operationId }, state: "complete" });
      } else if (path.endsWith("/sync/playback")) {
        response = Response.json({ verified: true });
      } else {
        throw new Error(`Unexpected gateway request: ${path}`);
      }
      return Promise.resolve(response);
    });
    const client = new EchoServerClient({
      deviceId: DEVICE_ID,
      fetch: gateway,
      origin: "https://echo.example/api/auth",
    });
    tasks.bind(
      {
        accountId: "account",
        inputRevision: saved.manifestSha256,
        meetingId: MEETING_ID,
        workspaceId: "workspace",
        workspaceSlug: "frozen-workspace",
      },
      ECHO_PROCESSING_STEPS,
    );
    const handlerInput = {
      allowedUploadOrigin: STORAGE_ORIGIN,
      artifactRoot: join(root, "artifacts"),
      cancelMeeting: () => Promise.resolve(),
      client,
      ffmpegBin: ffmpegPath,
      recordings,
    };
    const run = async (kind: keyof ReturnType<typeof createEchoProcessingHandlers>) => {
      const task = tasks.claim([kind]);
      const binding = tasks.binding(MEETING_ID);
      if (!(task && binding)) {
        throw new Error(`Unavailable task ${kind}`);
      }
      const handlers = createEchoProcessingHandlers({ ...handlerInput, tasks });
      try {
        const result = await handlers[kind]({
          binding,
          checkpoint: (value) => {
            expect(tasks.checkpoint(task, value)).toBe(true);
          },
          signal: AbortSignal.timeout(20_000),
          task,
        });
        expect(tasks.complete(task, result)).toBe(true);
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        tasks.fail(task, classifyMeetingTaskError(error), error.message);
        throw error;
      }
    };
    const reopen = () => {
      database.close();
      database = new DesktopDatabase(databaseOptions);
      clock += 30_001;
      tasks = new MeetingTaskStore(database, () => clock);
      tasks.suspend();
    };
    await run("register");
    await expect(run("backup")).rejects.toThrow("响应丢失");
    await run("media");
    await expect(run("transcript")).rejects.toThrow("退出");
    expect(submissions.size).toBe(1);
    reopen();
    await run("transcript");
    expect(submissions.size).toBe(2);
    await run("intelligence");
    expect(server.intelligence).toBeNull();
    expect(() => tasks.authorizeAudioRelease(MEETING_ID)).toThrow("尚未完成");
    reopen();
    expect(tasks.list(MEETING_ID).find((task) => task.kind === "intelligence")?.output).toContain(
      "周五交付",
    );
    await run("backup");
    expect(completeCalls).toBe(1);
    await run("sync-transcript");
    await run("sync-intelligence");
    await run("sync-playback");
    expect(intelligenceCalls).toBe(1);
    expect(storageFetch).toHaveBeenCalledTimes(5);
    expect(
      tasks.list(MEETING_ID).every((task) => task.state === "succeeded" && task.retry_count === 0),
    ).toBe(true);
    const service = new EchoProcessingService({ ...handlerInput, database });
    expect(service.localResults(MEETING_ID, "other-account").transcript).toBeNull();
    expect(service.localResults(MEETING_ID, "account").liveSummary).not.toBeNull();
    await service.releaseAudio(MEETING_ID);
    await service.releaseAudio(MEETING_ID);
    expect(service.localResults(MEETING_ID, "account").intelligence?.summary).toBe("周五交付");
    expect(await recordings.recover()).toEqual([]);
  } finally {
    database.close();
    await rm(root, { force: true, recursive: true });
  }
}, 30_000);
