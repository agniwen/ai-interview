import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopDatabase } from "../database";
import { MeetingTaskStore } from "./task-store";

function claim(store: MeetingTaskStore, kind: string) {
  const task = store.claim([kind]);
  if (!task) {
    throw new Error(`Expected a ready ${kind} task`);
  }
  return task;
}

const databases: DesktopDatabase[] = [];
const roots: string[] = [];
const binding = {
  accountId: "account-1",
  inputRevision: "sha256-1",
  meetingId: "meeting-1",
  workspaceId: "workspace-1",
  workspaceSlug: "example",
};
const steps = [
  { dependencies: [], kind: "backup" },
  { dependencies: [], kind: "transcript" },
  { dependencies: ["transcript"], kind: "intelligence" },
  { dependencies: ["backup", "intelligence"], kind: "sync" },
];

function open(path: string) {
  const database = new DesktopDatabase({
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path,
  });
  databases.push(database);
  return database;
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "echo-tasks-"));
  roots.push(root);
  let now = 1000;
  const path = join(root, "db.sqlite");
  const database = open(path);
  const store = new MeetingTaskStore(database, () => now);
  store.bind(binding, steps);
  return {
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    clock: () => now,
    database,
    path,
    store,
  };
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("durable Echo tasks", () => {
  it("backs up independently, persists segment checkpoints, and resumes dependencies after reopen", async () => {
    const f = await fixture();
    const backup = claim(f.store, "backup");
    const transcript = claim(f.store, "transcript");
    expect(f.store.claim(["intelligence", "sync"])).toBeNull();
    expect(
      f.store.checkpoint(transcript, {
        providerTaskId: "request-1",
        segments: [{ text: "第一段" }],
      }),
    ).toBe(true);
    expect(f.store.complete(backup, { verified: true })).toBe(true);
    f.database.close();
    databases.splice(databases.indexOf(f.database), 1);
    const restarted = new MeetingTaskStore(open(f.path), f.clock);
    restarted.suspend();
    const resumed = claim(restarted, "transcript");
    expect(JSON.parse(resumed.checkpoint ?? "null")).toEqual({
      providerTaskId: "request-1",
      segments: [{ text: "第一段" }],
    });
    expect(resumed.retry_count).toBe(0);
    expect(restarted.complete(transcript, { stale: true })).toBe(false);
    expect(restarted.complete(resumed, { text: "完整逐字稿" })).toBe(true);
    expect(restarted.claim(["sync"])).toBeNull();
    const intelligence = claim(restarted, "intelligence");
    expect(restarted.complete(intelligence, { summary: "纪要" })).toBe(true);
    expect(restarted.claim(["sync"])).toMatchObject({ kind: "sync" });
    restarted.bind(binding, steps);
    expect(restarted.list(binding.meetingId)).toHaveLength(4);
    expect(restarted.list(binding.meetingId)[1]?.output).toBe(
      JSON.stringify({ text: "完整逐字稿" }),
    );
  });

  it("permits five transient retries after the first attempt, preserving partial output", async () => {
    const f = await fixture();
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      const task = claim(f.store, "transcript");
      expect(task.retry_count).toBe(attempt);
      f.store.checkpoint(task, { completedSegments: 2 });
      f.store.fail(task, "transient", "服务暂不可用");
      f.advance(300_001);
    }
    expect(f.store.claim(["transcript"])).toBeNull();
    expect(f.store.list(binding.meetingId)[1]).toMatchObject({
      checkpoint: '{"completedSegments":2}',
      retry_count: 5,
      state: "failed",
    });
    f.store.retry(binding.meetingId);
    expect(f.store.claim(["transcript"])).toMatchObject({ retry_count: 0 });
  });

  it("pauses authorization and quota errors; offline and expired leases do not spend retries", async () => {
    const f = await fixture();
    const first = claim(f.store, "backup");
    f.store.fail(first, "offline", "无网络");
    expect(f.store.claim(["backup"])).toBeNull();
    f.advance(30_001);
    const second = claim(f.store, "backup");
    expect(second.retry_count).toBe(0);
    f.advance(120_001);
    const third = claim(f.store, "backup");
    expect(f.store.complete(second, { stale: true })).toBe(false);
    expect(third.retry_count).toBe(0);
    f.store.fail(third, "authorization", "请登录原账号");
    f.advance(1_000_000);
    expect(f.store.claim(["backup"])).toBeNull();
    f.store.retry(binding.meetingId);
    f.store.fail(claim(f.store, "backup"), "quota", "配额不足");
    expect(f.store.claim(["backup"])).toBeNull();
  });

  it("rejects owner changes and fences tombstoned tasks without dropping results", async () => {
    const f = await fixture();
    for (const patch of [
      { accountId: "other" },
      { workspaceId: "other" },
      { inputRevision: "other" },
    ]) {
      expect(() => f.store.bind({ ...binding, ...patch }, steps)).toThrow("已绑定");
    }
    const backup = claim(f.store, "backup");
    f.store.complete(backup, { verified: true });
    const transcript = claim(f.store, "transcript");
    f.store.checkpoint(transcript, { text: "保留" });
    f.store.tombstone(binding.meetingId);
    expect(f.store.complete(transcript, { stale: true })).toBe(false);
    expect(f.store.checkpoint(transcript, { stale: true })).toBe(false);
    f.store.retry(binding.meetingId);
    expect(f.store.claim(["transcript", "intelligence", "sync"])).toBeNull();
    expect(f.store.list(binding.meetingId)[0]?.output).toBe('{"verified":true}');
    expect(() => f.store.bind(binding, steps)).toThrow("已删除");
  });

  it("rolls back invalid dependency graphs without leaving partial tasks", async () => {
    const f = await fixture();
    expect(() =>
      f.store.bind({ ...binding, meetingId: "invalid" }, [
        { dependencies: ["sync"], kind: "sync" },
      ]),
    ).toThrow("依赖");
    expect(f.store.binding("invalid")).toBeNull();
    expect(f.store.list("invalid")).toEqual([]);
  });
});

it("resumes only purge after a tombstone, retaining text until final cleanup", async () => {
  const f = await fixture();
  const transcript = claim(f.store, "transcript");
  f.store.complete(transcript, { text: "尚未确认清理" });
  f.store.enqueuePurge(binding.meetingId);
  f.store.tombstone(binding.meetingId);
  const purge = claim(f.store, "purge");
  f.store.defer(purge, f.clock() + 60_000);
  expect(f.store.claim(["purge"])).toBeNull();
  expect(
    f.store.list(binding.meetingId).find((task) => task.kind === "transcript")?.output,
  ).toContain("尚未确认清理");
  f.advance(60_001);
  const continued = claim(f.store, "purge");
  expect(continued.retry_count).toBe(0);
  f.store.clearDeletedResults(binding.meetingId);
  expect(f.store.complete(continued, { deleted: true })).toBe(true);
  expect(
    f.store.list(binding.meetingId).find((task) => task.kind === "transcript")?.output,
  ).toBeNull();
});

it("separates different account operations for the same shared meeting", async () => {
  const f = await fixture();
  f.store.bind({ ...binding, meetingId: "question-1", resourceMeetingId: binding.meetingId }, [
    { dependencies: [], kind: "question" },
  ]);
  f.store.bind(
    {
      ...binding,
      accountId: "another-account",
      meetingId: "question-2",
      resourceMeetingId: binding.meetingId,
    },
    [{ dependencies: [], kind: "question" }],
  );
  expect(f.store.binding("question-1")?.account_id).toBe(binding.accountId);
  expect(f.store.binding("question-2")?.account_id).toBe("another-account");
  expect(f.store.binding("question-2")?.resource_meeting_id).toBe(binding.meetingId);
});
