import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDatabase } from "@app/database";
import {
  humanTranscriptionEvent,
  humanTranscriptionRun,
  humanTranscriptionEventAlias,
} from "@app/db-schema/human-transcription";
import type {
  HumanTranscriptionCallback,
  HumanTranscriptionEvent,
} from "@app/shared/human-transcription";
import { createHumanTranscriptionFinisher } from "./finish";
import { createHumanTranscriptionDao } from "./dao";
import { HumanTranscriptionConflictError } from "./errors";
import { createHumanTranscriptionStopper } from "../../../studio/routes/interviews/dao/human-transcription-stop";

const testUrl = process.env.HUMAN_TRANSCRIPTION_TEST_DATABASE_URL;
if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
  throw new Error("真人转录持久化测试必须使用隔离测试库");
}

// Replay the feature migrations against minimal parent fixtures in a private schema.
// Never migrate or truncate an existing application's tables.
describe.skipIf(!testUrl)("human transcription persistence", () => {
  const schema = `transcription_${crypto.randomUUID().replaceAll("-", "")}`;
  const client = postgres(testUrl ?? "postgres://localhost/unused", {
    connection: { search_path: schema },
    max: 4,
    onnotice: () => {},
  });
  const db = createDatabase(client);
  const dao = createHumanTranscriptionDao(db);
  const finish = createHumanTranscriptionFinisher(db);
  const stop = createHumanTranscriptionStopper(db);
  let job: HumanTranscriptionCallback;
  const event: HumanTranscriptionEvent = {
    endMs: 200,
    eventId: "event-1",
    itemId: "item-1",
    kind: "final",
    participantIdentity: "candidate",
    providerTaskId: "provider-1",
    revision: 0,
    startMs: 100,
    streamEpoch: "epoch-1",
    text: "候选人的回答",
    trackId: "track-1",
  };

  beforeAll(async () => {
    await client.unsafe(`CREATE SCHEMA "${schema}"`);
    await client.unsafe(
      "CREATE TABLE organization (id text PRIMARY KEY); CREATE TABLE human_interview_meeting (id text PRIMARY KEY)",
    );
    const migration = await readFile(
      new URL(
        "../../../../../../../web/drizzle/20260918015827_milky_anthem/migration.sql",
        import.meta.url,
      ),
      "utf-8",
    );
    await client.unsafe(migration);
    await client.unsafe(
      "ALTER TABLE human_transcription_run ADD COLUMN error text, ADD COLUMN cutoff_at timestamptz, ADD COLUMN drained_at timestamptz, ADD COLUMN source_snapshot jsonb, ADD COLUMN recognition_hints jsonb, ADD COLUMN cleanup_at timestamptz, ADD COLUMN downstream_requested_at timestamptz",
    );
  });

  beforeEach(async () => {
    const id = crypto.randomUUID();
    job = {
      executionId: crypto.randomUUID(),
      generation: 1,
      kind: "human_interview_transcription",
      meetingId: id,
      organizationId: id,
      roomName: `human_${id}`,
      runId: id,
      schemaVersion: 1,
    };
    await client`INSERT INTO organization (id) VALUES (${id})`;
    await client`INSERT INTO human_interview_meeting (id) VALUES (${id})`;
    await db.insert(humanTranscriptionRun).values({
      id,
      meetingId: id,
      mode: "shadow",
      organizationId: id,
      participants: { candidate: { displayName: "候选人", role: "candidate" } },
      roomName: job.roomName,
    });
  });

  afterAll(async () => {
    try {
      await client.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  });

  it("repeated cutoff and finish preserve the first boundary and previous gaps", async () => {
    await dao.claimHumanTranscription(job);
    await finish(job, "ready");
    const boundary = new Date("2026-09-18T00:00:00Z");
    await db
      .update(humanTranscriptionRun)
      .set({ endedAt: boundary, error: "known gap" })
      .where(eq(humanTranscriptionRun.id, job.runId));
    await finish(job, "cutoff");
    await finish(job, "finish", null);
    const [first] = await db
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.id, job.runId));
    await finish(job, "cutoff");
    await finish(job, "finish");
    const [second] = await db
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.id, job.runId));
    expect(second.endedAt).toEqual(boundary);
    expect(second.cutoffAt).toEqual(first.cutoffAt);
    expect(second.drainedAt).toEqual(first.drainedAt);
    expect(second.error).toBe("known gap");
    await db
      .update(humanTranscriptionRun)
      .set({ status: "needs_review" })
      .where(eq(humanTranscriptionRun.id, job.runId));
    await expect(finish(job, "finish")).resolves.toEqual({ ok: true });
    await expect(finish({ ...job, generation: 2 }, "finish")).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
  });

  it("collector shutdown drains its events without ending the human meeting", async () => {
    await dao.claimHumanTranscription(job);
    await finish(job, "ready");
    await finish(job, "cutoff");
    await dao.appendHumanTranscriptionEvents(job, [event]);
    await finish(job, "finish");
    await finish(job, "finish");
    const [run] = await db
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.id, job.runId));
    expect(run.endedAt).toBeNull();
    expect(run.status).toBe("recovering");
    expect(run.drainedAt).toBeTruthy();
    expect(run.error).toBeTruthy();
  });

  it("concurrent and repeated end requests retain the run and its first boundary", async () => {
    await db
      .update(humanTranscriptionRun)
      .set({ mode: "server_realtime" })
      .where(eq(humanTranscriptionRun.id, job.runId));
    const results = await Promise.all([stop(job.roomName), stop(job.roomName)]);
    expect(results.map((run) => run?.mode)).toEqual(["server_realtime", "server_realtime"]);
    expect(results[0]?.endedAt).toEqual(results[1]?.endedAt);
    const repeated = await stop(job.roomName);
    expect(repeated?.endedAt).toEqual(results[0]?.endedAt);
    expect(await stop("missing-room")).toBeUndefined();
  });

  it("allows exactly one concurrent claimant and permits its retry", async () => {
    const competing = { ...job, executionId: crypto.randomUUID() };
    const results = await Promise.allSettled([
      dao.claimHumanTranscription(job),
      dao.claimHumanTranscription(competing),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    const [run] = await db
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.id, job.runId));
    const owner = run.executionId === job.executionId ? job : competing;
    const other = owner === job ? competing : job;
    expect(await dao.claimHumanTranscription(owner)).toMatchObject({
      startedAt: run.startedAt?.toISOString(),
    });
    await expect(dao.appendHumanTranscriptionEvents(other, [event])).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    await expect(dao.appendHumanTranscriptionEvents(other, [])).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    const result = await dao.appendHumanTranscriptionEvents(owner, [event]);
    expect(result.cursor).toBe(1);
  });

  it("rejects writes before claim and fences the previous generation after takeover", async () => {
    await expect(dao.appendHumanTranscriptionEvents(job, [event])).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    await dao.claimHumanTranscription(job);
    await db
      .update(humanTranscriptionRun)
      .set({ executionId: null, generation: 2, status: "starting" })
      .where(eq(humanTranscriptionRun.id, job.runId));
    const next = { ...job, executionId: crypto.randomUUID(), generation: 2 };
    await dao.claimHumanTranscription(next);
    await expect(dao.claimHumanTranscription(job)).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    await expect(dao.appendHumanTranscriptionEvents(job, [event])).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    const result = await dao.appendHumanTranscriptionEvents(next, [event]);
    expect(result.cursor).toBe(1);
  });

  it("does not grant an unowned capturing run to a new claimant", async () => {
    await db
      .update(humanTranscriptionRun)
      .set({ status: "capturing" })
      .where(eq(humanTranscriptionRun.id, job.runId));
    await expect(dao.claimHumanTranscription(job)).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
  });

  it("deduplicates concurrent sentence retries even with different event IDs", async () => {
    await dao.claimHumanTranscription(job);
    const alias = { ...event, eventId: "retry-id" };
    const results = await Promise.all([
      dao.appendHumanTranscriptionEvents(job, [event]),
      dao.appendHumanTranscriptionEvents(job, [alias]),
    ]);
    expect(results).toEqual([
      { acknowledgedIds: [event.eventId], cursor: 1, stop: false },
      { acknowledgedIds: [alias.eventId], cursor: 1, stop: false },
    ]);
    expect(await dao.readHumanTranscriptionEvents(job.runId)).toHaveLength(1);
  });

  it("persists acknowledged aliases across DAO recreation and rejects their reuse", async () => {
    await dao.claimHumanTranscription(job);
    await dao.appendHumanTranscriptionEvents(job, [event]);
    const alias = { ...event, eventId: "acknowledged-alias" };
    await dao.appendHumanTranscriptionEvents(job, [alias]);
    const restarted = createHumanTranscriptionDao(db);
    for (const changed of [
      { ...alias, itemId: "other-item", text: "另一个回答" },
      { ...alias, revision: 1, text: "修订回答" },
    ]) {
      await expect(restarted.appendHumanTranscriptionEvents(job, [changed])).rejects.toBeInstanceOf(
        HumanTranscriptionConflictError,
      );
    }
    expect(await restarted.appendHumanTranscriptionEvents(job, [alias])).toEqual({
      acknowledgedIds: [alias.eventId],
      cursor: 1,
      stop: false,
    });
    expect(await restarted.readHumanTranscriptionEvents(job.runId)).toHaveLength(1);
  });

  it("rolls back new alias bindings when a later event in the batch conflicts", async () => {
    await dao.claimHumanTranscription(job);
    await dao.appendHumanTranscriptionEvents(job, [event]);
    const alias = { ...event, eventId: "batch-alias" };
    const other = { ...alias, itemId: "other-item", text: "另一个回答" };
    await expect(dao.appendHumanTranscriptionEvents(job, [alias, other])).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    expect(await dao.appendHumanTranscriptionEvents(job, [other])).toEqual({
      acknowledgedIds: [other.eventId],
      cursor: 2,
      stop: false,
    });
    await expect(dao.appendHumanTranscriptionEvents(job, [alias])).rejects.toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
  });

  it("allows only one concurrent binding of an alias to different saved sentences", async () => {
    await dao.claimHumanTranscription(job);
    const other = { ...event, eventId: "second", itemId: "other-item", text: "另一个回答" };
    await dao.appendHumanTranscriptionEvents(job, [event, other]);
    const results = await Promise.allSettled([
      dao.appendHumanTranscriptionEvents(job, [{ ...event, eventId: "shared-alias" }]),
      dao.appendHumanTranscriptionEvents(job, [{ ...other, eventId: "shared-alias" }]),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
      HumanTranscriptionConflictError,
    );
    expect(await dao.readHumanTranscriptionEvents(job.runId)).toHaveLength(2);
  });

  it("rolls back the entire batch on a conflicting sentence revision", async () => {
    await dao.claimHumanTranscription(job);
    await dao.appendHumanTranscriptionEvents(job, [event]);
    await expect(
      dao.appendHumanTranscriptionEvents(job, [
        { ...event, eventId: "new-item", itemId: "item-2" },
        { ...event, eventId: "conflict", text: "被修改的回答" },
      ]),
    ).rejects.toBeInstanceOf(HumanTranscriptionConflictError);
    expect(await dao.readHumanTranscriptionEvents(job.runId)).toHaveLength(1);
    const result = await dao.appendHumanTranscriptionEvents(job, []);
    expect(result.cursor).toBe(1);
  });

  it("retains event-ID conflict detection and accepts explicit new revisions", async () => {
    await dao.claimHumanTranscription(job);
    await dao.appendHumanTranscriptionEvents(job, [event]);
    await expect(
      dao.appendHumanTranscriptionEvents(job, [{ ...event, itemId: "other-item" }]),
    ).rejects.toBeInstanceOf(HumanTranscriptionConflictError);
    const result = await dao.appendHumanTranscriptionEvents(job, [
      { ...event, eventId: "revision-1", revision: 1, text: "修订回答" },
    ]);
    expect(result.cursor).toBe(2);
  });

  it("keeps epochs and provider tasks distinct when the provider reuses an item ID", async () => {
    await dao.claimHumanTranscription(job);
    const result = await dao.appendHumanTranscriptionEvents(job, [
      event,
      { ...event, eventId: "epoch-2", streamEpoch: "epoch-2" },
      { ...event, eventId: "provider-2", providerTaskId: "provider-2" },
    ]);
    expect(result.cursor).toBe(3);
  });

  it("enforces the sentence identity in the database even when bypassing the DAO", async () => {
    await dao.claimHumanTranscription(job);
    await dao.appendHumanTranscriptionEvents(job, [event]);
    await expect(
      db.insert(humanTranscriptionEvent).values({
        eventId: "bypass",
        eventSeq: 2,
        generation: job.generation,
        id: crypto.randomUUID(),
        payload: { ...event, eventId: "bypass" },
        runId: job.runId,
      }),
    ).rejects.toThrow();
  });

  it("enforces alias uniqueness and canonical generation scope in the database", async () => {
    await dao.claimHumanTranscription(job);
    const other = { ...event, eventId: "second", itemId: "other-item" };
    await dao.appendHumanTranscriptionEvents(job, [
      event,
      other,
      { ...event, eventId: "bound-alias" },
    ]);
    await expect(
      db.insert(humanTranscriptionEventAlias).values({
        canonicalEventId: other.eventId,
        eventId: "bound-alias",
        generation: job.generation,
        runId: job.runId,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(humanTranscriptionEventAlias).values({
        canonicalEventId: event.eventId,
        eventId: "wrong-generation",
        generation: job.generation + 1,
        runId: job.runId,
      }),
    ).rejects.toThrow();
  });

  it("scopes aliases by generation and cleans them up with the run", async () => {
    await dao.claimHumanTranscription(job);
    await dao.appendHumanTranscriptionEvents(job, [event, { ...event, eventId: "alias" }]);
    await db
      .update(humanTranscriptionRun)
      .set({ executionId: null, generation: 2, status: "starting" })
      .where(eq(humanTranscriptionRun.id, job.runId));
    const next = { ...job, executionId: crypto.randomUUID(), generation: 2 };
    await dao.claimHumanTranscription(next);
    const changed = { ...event, text: "新代次回答" };
    expect(
      await dao.appendHumanTranscriptionEvents(next, [changed, { ...changed, eventId: "alias" }]),
    ).toEqual({
      acknowledgedIds: [event.eventId, "alias"],
      cursor: 2,
      stop: false,
    });
    expect(
      await db
        .select()
        .from(humanTranscriptionEventAlias)
        .where(eq(humanTranscriptionEventAlias.runId, job.runId)),
    ).toHaveLength(2);
    await db.delete(humanTranscriptionRun).where(eq(humanTranscriptionRun.id, job.runId));
    expect(
      await db
        .select()
        .from(humanTranscriptionEventAlias)
        .where(eq(humanTranscriptionEventAlias.runId, job.runId)),
    ).toHaveLength(0);
  });

  it("does not collapse separate lifecycle events into the sentence key", async () => {
    await dao.claimHumanTranscription(job);
    const result = await dao.appendHumanTranscriptionEvents(job, [
      { ...event, eventId: "start", kind: "stream_started", text: "" },
      { ...event, eventId: "end", kind: "stream_ended", text: "" },
      event,
    ]);
    expect(result.cursor).toBe(3);
  });
});
