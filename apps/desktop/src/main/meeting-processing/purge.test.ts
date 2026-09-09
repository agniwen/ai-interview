import { EchoProcessingService } from "./service";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { DesktopDatabase } from "../database";
import { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import { MeetingTaskStore } from "./task-store";
import { EchoServerClient } from "./server-client";
import { createEchoPurgeHandler } from "./purge";
import { MeetingTaskDeferredError } from "./task-deferred-error";

it("a reader waits for the tombstone, then erases every local account's results without a destructive request", async () => {
  const root = await mkdtemp(join(tmpdir(), "echo-purge-"));
  const database = new DesktopDatabase({
    migrationsFolder: join(process.cwd(), "drizzle-local"),
    path: join(root, "tasks.sqlite"),
  });
  const tasks = new MeetingTaskStore(database);
  const resourceId = "00000000-0000-4000-8000-000000000901";
  const commandId = "00000000-0000-4000-8000-000000000902";
  const owner = {
    accountId: "owner",
    inputRevision: "manifest",
    meetingId: resourceId,
    workspaceId: "workspace",
    workspaceSlug: "original-workspace",
  };
  const artifactRoot = join(root, "artifacts");
  let deleted = false;
  let canAdvance = false;
  const requests: { path: string; method: string }[] = [];
  const client = new EchoServerClient({
    deviceId: "00000000-0000-4000-8000-000000000903",
    fetch: vi.fn((url, options) => {
      const path = String(url);
      requests.push({ method: options?.method ?? "GET", path });
      if (path.endsWith("get-session")) {
        return Promise.resolve(Response.json({ user: { id: "reader" } }));
      }
      expect(new Headers(options?.headers).get("X-Echo-Workspace-Id")).toBe("workspace");
      expect(path).toContain(`/${resourceId}/device/deletion`);
      return Promise.resolve(
        Response.json({
          canAdvance,
          manifestSha256: "manifest",
          nextAttemptAt: new Date().toISOString(),
          state: deleted ? "deleted" : "purging",
        }),
      );
    }),
    origin: "https://echo.example",
  });
  const recordings = new LocalMeetingRecordingStore(join(root, "recordings"));
  await recordings.recover();
  try {
    tasks.bind(owner, [{ dependencies: [], kind: "transcript" }]);
    tasks.bind(
      { ...owner, accountId: "reader", meetingId: commandId, resourceMeetingId: resourceId },
      [{ dependencies: [], kind: "question" }],
    );
    for (const id of [resourceId, commandId]) {
      const task = tasks.claim([id === resourceId ? "transcript" : "question"]);
      if (!task) {
        throw new Error("missing fixture task");
      }
      tasks.complete(task, { text: "私有文字" });
      await mkdir(join(artifactRoot, id), { recursive: true });
      await writeFile(join(artifactRoot, id, "result.json"), "私有文字");
    }
    tasks.enqueuePurge(commandId);
    const task = tasks.claim(["purge"]);
    const binding = tasks.binding(commandId);
    if (!(task && binding)) {
      throw new Error("missing purge binding");
    }
    const cancelMeeting = vi.fn(() => Promise.resolve());
    const handler = createEchoPurgeHandler({
      artifactRoot,
      cancelMeeting,
      client,
      recordings,
      tasks,
    });
    const context = {
      binding,
      checkpoint: () => {
        throw new Error("unused checkpoint");
      },
      signal: AbortSignal.timeout(5000),
      task,
    };
    await expect(handler(context)).rejects.toBeInstanceOf(MeetingTaskDeferredError);
    expect(await readFile(join(artifactRoot, resourceId, "result.json"), "utf-8")).toBe("私有文字");
    expect(tasks.list(commandId).find((item) => item.kind === "question")?.output).toContain(
      "私有文字",
    );
    tasks.enqueuePurge(resourceId);
    deleted = true;
    expect(await handler(context)).toEqual({ deleted: true });
    for (const id of [resourceId, commandId]) {
      expect(tasks.binding(id)?.deleted_at).toBeGreaterThan(0);
      expect(
        tasks
          .list(id)
          .filter((item) => item.kind !== "purge")
          .every((item) => item.output === null && item.checkpoint === null),
      ).toBe(true);
      await expect(readFile(join(artifactRoot, id, "result.json"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(cancelMeeting).toHaveBeenCalledWith(id);
      expect(tasks.list(id).find((item) => item.kind === "purge")?.state).toBe("succeeded");
    }
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    canAdvance = true;
    const service = new EchoProcessingService({
      allowedUploadOrigin: "https://recordings.example",
      artifactRoot,
      client,
      database,
      ffmpegBin: "unused",
      recordings,
    });
    await service.requestPurge({
      accountId: "reader",
      meetingId: resourceId,
      workspaceId: "workspace",
      workspaceSlug: "original-workspace",
    });
    expect(tasks.binding(resourceId)?.account_id).toBe("owner");
    expect(tasks.binding(commandId)?.account_id).toBe("reader");
    expect(tasks.bindings()).toHaveLength(2);
  } finally {
    database.close();
    await rm(root, { force: true, recursive: true });
  }
});
