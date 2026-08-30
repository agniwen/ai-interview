import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalMeetingSessionStore } from "./local-meeting-session-store";
import { LocalMeetingRecordingStore } from "./local-meeting-recording-store";

const roots: string[] = [];
const SESSION_ID = "00000000-0000-4000-8000-000000000077";

async function createStore() {
  const root = await mkdtemp(join(tmpdir(), "meeting-session-store-"));
  roots.push(root);
  return new LocalMeetingSessionStore(join(root, "db.sqlite"), {
    now: () => new Date("2026-08-12T10:00:00.000Z"),
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("LocalMeetingSessionStore", () => {
  it("persists session identity, draft, title and lifecycle across store reopen", async () => {
    const store = await createStore();
    store.create({
      id: SESSION_ID,
      recruitingRecordId: "candidate-1",
      startedAt: "2026-08-12T09:59:00.000Z",
      title: "本地录音",
    });
    store.update(SESSION_ID, {
      liveTranscriptDraft: {
        capturedAt: "2026-08-12T10:00:00.000Z",
        droppedAudioMs: 0,
        droppedPcmFrames: 0,
        error: null,
        sections: [
          {
            id: "section-1",
            sequence: 0,
            startedAt: "2026-08-12T09:59:00.000Z",
            track: "system",
          },
        ],
        turns: [
          {
            final: true,
            id: "turn-1",
            sectionId: "section-1",
            text: "讨论产品发布计划",
            track: "system",
          },
        ],
      },
      segmentCount: 2,
      state: "interrupted",
      title: "产品发布计划",
    });
    const { path } = store;
    store.close();

    const reopened = new LocalMeetingSessionStore(path, {
      now: () => new Date("2026-08-12T10:01:00.000Z"),
    });
    expect(reopened.get(SESSION_ID)).toMatchObject({
      id: SESSION_ID,
      recruitingRecordId: "candidate-1",
      segmentCount: 2,
      state: "interrupted",
      title: "产品发布计划",
    });
    expect(reopened.get(SESSION_ID)?.liveTranscriptDraft?.turns[0]?.text).toBe("讨论产品发布计划");
    reopened.close();
  });

  it("creates the SQLite database inside a newly created recording root", async () => {
    const parent = await mkdtemp(join(tmpdir(), "meeting-recording-parent-"));
    roots.push(parent);
    const nestedRoot = join(parent, "missing", "default-profile");
    const recordingStore = new LocalMeetingRecordingStore(nestedRoot);

    expect(recordingStore.listLocalSessions()).toEqual([]);
    const databaseFile = await stat(join(nestedRoot, "db.sqlite"));
    expect(databaseFile.isFile()).toBe(true);
  });

  it("moves the legacy sessions database to db.sqlite without losing rows", async () => {
    const recordingRoot = await mkdtemp(join(tmpdir(), "meeting-database-rename-"));
    roots.push(recordingRoot);
    const legacy = new LocalMeetingSessionStore(join(recordingRoot, "sessions.sqlite"));
    legacy.create({
      id: SESSION_ID,
      recruitingRecordId: null,
      startedAt: "2026-08-12T09:59:00.000Z",
      title: "旧数据库中的会议",
    });
    legacy.close();

    const recordingStore = new LocalMeetingRecordingStore(recordingRoot);

    expect(recordingStore.listLocalSessions()).toEqual([
      expect.objectContaining({ id: SESSION_ID, title: "旧数据库中的会议" }),
    ]);
    const databaseFile = await stat(join(recordingRoot, "db.sqlite"));
    expect(databaseFile.isFile()).toBe(true);
    await expect(stat(join(recordingRoot, "sessions.sqlite"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("retains a verified row until explicit remote visibility acknowledgement", async () => {
    const store = await createStore();
    store.create({
      id: SESSION_ID,
      recruitingRecordId: null,
      startedAt: "2026-08-12T09:59:00.000Z",
      title: "本地录音",
    });
    store.update(SESSION_ID, { state: "workspace-verified" });

    expect(store.list()).toHaveLength(1);
    store.acknowledgeRemoteVisibility(SESSION_ID);
    expect(store.list()).toHaveLength(0);
    store.close();
  });
});
