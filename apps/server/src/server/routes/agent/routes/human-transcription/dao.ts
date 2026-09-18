import { and, eq, gt, or, sql } from "drizzle-orm";
import {
  humanTranscriptionRun,
  humanTranscriptionEvent,
  humanTranscriptionEventAlias,
} from "@app/db-schema/human-transcription";
import type {
  HumanTranscriptionEvent,
  HumanTranscriptionCallback,
} from "@app/shared/human-transcription";
import { db as defaultDb } from "../../../../../lib/server/db/index";

import type { Database } from "@app/database";

import { HumanTranscriptionConflictError } from "./errors";

export function createHumanTranscriptionDao(db: Database) {
  function claimHumanTranscription(job: HumanTranscriptionCallback) {
    return db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(humanTranscriptionRun)
        .where(
          and(
            eq(humanTranscriptionRun.id, job.runId),
            eq(humanTranscriptionRun.organizationId, job.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !run ||
        run.meetingId !== job.meetingId ||
        run.roomName !== job.roomName ||
        run.generation !== job.generation ||
        !["pending", "starting", "capturing", "finalizing"].includes(run.status)
      ) {
        throw new HumanTranscriptionConflictError("任务绑定或执行代次无效");
      }
      if (
        (run.executionId !== null && run.executionId !== job.executionId) ||
        (run.executionId === null && !["pending", "starting"].includes(run.status))
      ) {
        throw new HumanTranscriptionConflictError("任务已被其他执行者认领");
      }
      const startedAt = run.startedAt ?? new Date();
      const status = ["pending", "starting"].includes(run.status) ? "starting" : run.status;
      await tx
        .update(humanTranscriptionRun)
        .set({
          executionId: job.executionId,
          heartbeatAt: new Date(),
          startedAt,
          status: run.endedAt ? "finalizing" : status,
        })
        .where(eq(humanTranscriptionRun.id, run.id));
      return {
        hints: run.recognitionHints ?? { context: [], vocabulary: {} },
        mode: run.mode,
        participants: run.participants,
        startedAt: startedAt.toISOString(),
        stop: Boolean(run.endedAt),
      };
    });
  }

  function appendHumanTranscriptionEvents(
    job: HumanTranscriptionCallback,
    events: HumanTranscriptionEvent[],
  ) {
    return db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(humanTranscriptionRun)
        .where(eq(humanTranscriptionRun.id, job.runId))
        .for("update")
        .limit(1);
      if (
        !run ||
        run.organizationId !== job.organizationId ||
        run.meetingId !== job.meetingId ||
        run.roomName !== job.roomName ||
        run.generation !== job.generation ||
        run.executionId !== job.executionId ||
        !["starting", "capturing", "finalizing"].includes(run.status)
      ) {
        throw new HumanTranscriptionConflictError("任务已失去写入权");
      }
      let cursor = run.eventSeq;
      for (const event of events) {
        if (!Object.hasOwn(run.participants, event.participantIdentity)) {
          throw new HumanTranscriptionConflictError("音轨发布者未经授权");
        }
        const [alias] = await tx
          .select()
          .from(humanTranscriptionEventAlias)
          .where(
            and(
              eq(humanTranscriptionEventAlias.runId, run.id),
              eq(humanTranscriptionEventAlias.generation, job.generation),
              eq(humanTranscriptionEventAlias.eventId, event.eventId),
            ),
          )
          .limit(1);
        const existingEvents = await tx
          .select()
          .from(humanTranscriptionEvent)
          .where(
            and(
              eq(humanTranscriptionEvent.runId, run.id),
              eq(humanTranscriptionEvent.generation, job.generation),
              or(
                eq(humanTranscriptionEvent.eventId, event.eventId),
                alias ? eq(humanTranscriptionEvent.eventId, alias.canonicalEventId) : undefined,
                event.kind === "final"
                  ? and(
                      sql`${humanTranscriptionEvent.payload}->>'kind' = 'final'`,
                      sql`${humanTranscriptionEvent.payload}->>'streamEpoch' = ${event.streamEpoch}`,
                      sql`${humanTranscriptionEvent.payload}->>'providerTaskId' = ${event.providerTaskId}`,
                      sql`${humanTranscriptionEvent.payload}->>'itemId' = ${event.itemId}`,
                      sql`${humanTranscriptionEvent.payload}->>'revision' = ${String(event.revision)}`,
                    )
                  : undefined,
              ),
            ),
          );
        for (const existing of existingEvents) {
          if (
            Object.entries(event).some(
              ([key, value]) =>
                key !== "eventId" &&
                Object.entries(existing.payload).find(
                  ([existingKey]) => existingKey === key,
                )?.[1] !== value,
            )
          ) {
            throw new HumanTranscriptionConflictError("重复事件内容冲突");
          }
        }
        const [canonicalEvent] = existingEvents;
        if (canonicalEvent) {
          if (!alias && canonicalEvent.eventId !== event.eventId) {
            await tx.insert(humanTranscriptionEventAlias).values({
              canonicalEventId: canonicalEvent.eventId,
              eventId: event.eventId,
              generation: job.generation,
              runId: run.id,
            });
          }
          continue;
        }
        cursor += 1;
        await tx.insert(humanTranscriptionEvent).values({
          eventId: event.eventId,
          eventSeq: cursor,
          generation: job.generation,
          id: crypto.randomUUID(),
          payload: event,
          runId: run.id,
        });
      }
      await tx
        .update(humanTranscriptionRun)
        .set({ eventSeq: cursor, heartbeatAt: new Date() })
        .where(eq(humanTranscriptionRun.id, run.id));
      return {
        acknowledgedIds: events.map((event) => event.eventId),
        cursor,
        stop: Boolean(run.endedAt),
      };
    });
  }

  function readHumanTranscriptionEvents(runId: string, after = 0) {
    return db
      .select()
      .from(humanTranscriptionEvent)
      .where(
        and(eq(humanTranscriptionEvent.runId, runId), gt(humanTranscriptionEvent.eventSeq, after)),
      )
      .orderBy(humanTranscriptionEvent.eventSeq)
      .limit(100);
  }

  return { appendHumanTranscriptionEvents, claimHumanTranscription, readHumanTranscriptionEvents };
}

export const {
  claimHumanTranscription,
  appendHumanTranscriptionEvents,
  readHumanTranscriptionEvents,
} = createHumanTranscriptionDao(defaultDb);
