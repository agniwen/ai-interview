import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { expect, it } from "vitest";
import { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import { DesktopDatabase } from "../database";
import { MeetingTaskStore } from "./task-store";
import { createLocalMediaHandler, inspectLocalAudio } from "./media";

it("mixes real audio in a child process and retains verifiable local playback and ASR chunks", async () => {
  if (!ffmpegPath) {
    throw new Error("此平台缺少 FFmpeg");
  }
  const root = await mkdtemp(join(tmpdir(), "echo-media-"));
  const database = new DesktopDatabase({
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path: join(root, "tasks.sqlite"),
  });
  try {
    const sourcePath = join(root, "tone.webm");
    await promisify(execFile)(ffmpegPath, [
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.5",
      "-c:a",
      "libopus",
      sourcePath,
    ]);
    const bytes = await readFile(sourcePath);
    const meetingId = "00000000-0000-4000-8000-000000000101";
    const store = new LocalMeetingRecordingStore(join(root, "capture"));
    await store.recover();
    await store.begin({
      captureId: meetingId,
      recruitingRecordId: null,
      startedAt: "2026-09-09T00:00:00.000Z",
      trackContentTypes: { microphone: "audio/webm", system: "audio/webm" },
      videoTracksDiscarded: 0,
    });
    for (const track of ["microphone", "system"] as const) {
      await store.append(
        {
          captureId: meetingId,
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
    const saved = await store.save(meetingId);
    const tasks = new MeetingTaskStore(database);
    tasks.bind(
      {
        accountId: "account",
        inputRevision: saved.manifestSha256,
        meetingId,
        workspaceId: "workspace",
        workspaceSlug: "slug",
      },
      [{ dependencies: [], kind: "media" }],
    );
    const task = tasks.claim(["media"]);
    const binding = tasks.binding(meetingId);
    if (!(task && binding)) {
      throw new Error("缺少媒体任务");
    }
    const output = await createLocalMediaHandler({
      ffmpegBin: ffmpegPath,
      root: join(root, "processing"),
      store,
    })({
      binding,
      checkpoint: (value) => {
        expect(tasks.checkpoint(task, value)).toBe(true);
      },
      signal: new AbortController().signal,
      task,
    });
    expect(output.playback.durationMs).toBe(500);
    expect(output.playback.sizeBytes).toBeGreaterThan(0);
    expect(output.chunks).toHaveLength(2);
    expect(output.chunks.map((chunk) => chunk.track)).toEqual(["microphone", "system"]);
    expect(await inspectLocalAudio(output.playback.filePath, 500)).toEqual(output.playback);
    expect(await store.describeWorkspaceSave(meetingId)).toMatchObject({
      manifestSha256: saved.manifestSha256,
    });
    const metadata = await stat(output.playback.filePath);
    expect(metadata.isFile()).toBe(true);
    expect(tasks.complete(task, output)).toBe(true);
    expect(tasks.list(meetingId)[0]?.state).toBe("succeeded");
  } finally {
    database.close();
    await rm(root, { force: true, recursive: true });
  }
});
