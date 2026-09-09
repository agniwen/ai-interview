import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopDatabase } from "../database";
import { MeetingTaskStore } from "./task-store";
import { MeetingTaskScheduler } from "./scheduler";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

it("continues without a window and fences a provider response after shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "echo-scheduler-"));
  const database = new DesktopDatabase({
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path: join(root, "db.sqlite"),
  });
  const store = new MeetingTaskStore(database);
  store.bind(
    {
      accountId: "account",
      inputRevision: "hash",
      meetingId: "meeting",
      workspaceId: "workspace",
      workspaceSlug: "slug",
    },
    [
      { dependencies: [], kind: "backup" },
      { dependencies: [], kind: "transcript" },
    ],
  );
  const gate = Promise.withResolvers<boolean>();
  const handler = vi.fn(async ({ checkpoint }: { checkpoint: (value: null) => void }) => {
    checkpoint(null);
    await gate.promise;
    return { text: "旧请求" };
  });
  const scheduler = new MeetingTaskScheduler(store, { backup: handler, transcript: handler }, 1);
  cleanups.push(async () => {
    scheduler.stop();
    database.close();
    await rm(root, { force: true, recursive: true });
  });
  scheduler.start();
  expect(handler).toHaveBeenCalledTimes(1);
  scheduler.stop();
  expect(store.list("meeting")[0]).toMatchObject({ retry_count: 0, state: "ready" });
  gate.resolve(true);
  await delay(0);
  expect(store.list("meeting")[0]?.output).toBeNull();
  expect(handler).toHaveBeenCalledTimes(1);
  scheduler.start();
  await vi.waitFor(() =>
    expect(store.list("meeting").every((task) => task.state === "succeeded")).toBe(true),
  );
  expect(handler).toHaveBeenCalledTimes(3);
});

it("interrupts background media for live capture and resumes it without spending a retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "echo-priority-"));
  const database = new DesktopDatabase({
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path: join(root, "db.sqlite"),
  });
  const store = new MeetingTaskStore(database);
  store.bind(
    {
      accountId: "account",
      inputRevision: "hash",
      meetingId: "old-meeting",
      workspaceId: "workspace",
      workspaceSlug: "slug",
    },
    [
      { dependencies: [], kind: "media" },
      { dependencies: [], kind: "backup" },
    ],
  );
  const gate = Promise.withResolvers<boolean>();
  let calls = 0;
  const media = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
    calls += 1;
    if (calls === 1) {
      signal.addEventListener("abort", () => gate.resolve(true), { once: true });
      await gate.promise;
      signal.throwIfAborted();
    }
    return { file: "verified" };
  });
  const backup = vi.fn(() => Promise.resolve({ verified: true }));
  const scheduler = new MeetingTaskScheduler(store, { backup, media });
  cleanups.push(async () => {
    scheduler.stop();
    database.close();
    await rm(root, { force: true, recursive: true });
  });
  scheduler.start();
  expect(media).toHaveBeenCalledOnce();
  scheduler.captureStarted("new-capture");
  await delay(0);
  scheduler.wake();
  expect(media).toHaveBeenCalledOnce();
  expect(backup).toHaveBeenCalledOnce();
  expect(store.list("old-meeting").find((task) => task.kind === "media")).toMatchObject({
    retry_count: 0,
    state: "ready",
  });
  scheduler.captureFinished("new-capture");
  await vi.waitFor(() =>
    expect(store.list("old-meeting").every((task) => task.state === "succeeded")).toBe(true),
  );
  expect(media).toHaveBeenCalledTimes(2);
});
