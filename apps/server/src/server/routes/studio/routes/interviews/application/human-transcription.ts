import { setTimeout as delay } from "node:timers/promises";
import { AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { and, eq, inArray, sql, or, isNull } from "drizzle-orm";
import {
  humanTranscriptionRun,
  humanTranscriptionEvent,
  humanInterviewMeeting,
} from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { loadTrackRecordingScope } from "../dao/human-interview-recording-tracks";
import { createHumanTranscriptionStopper } from "../dao/human-transcription-stop";

function clients() {
  const url = process.env.LIVEKIT_URL?.replace(/^ws/, "http");
  if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    throw new Error("LiveKit 未配置");
  }
  return {
    dispatch: new AgentDispatchClient(
      url,
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    ),
    room: new RoomServiceClient(url, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET),
  };
}

async function prepareHumanTranscriptionRun(
  roomName: string,
  scope: NonNullable<Awaited<ReturnType<typeof loadTrackRecordingScope>>>,
) {
  if (!["scheduled", "in_progress"].includes(scope.meeting.status)) {
    throw new Error("会议已结束");
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(17182024)`);
    await tx
      .select({ id: humanInterviewMeeting.id })
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, scope.meeting.id))
      .for("update");
    const [existing] = await tx
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.meetingId, scope.meeting.id));
    if (existing) {
      const claim =
        ["pending", "starting"].includes(existing.status) &&
        !existing.dispatchId &&
        !existing.executionId &&
        (existing.status === "pending" ||
          Date.now() - (existing.heartbeatAt ?? existing.createdAt).getTime() > 15_000);
      if (claim) {
        await tx
          .update(humanTranscriptionRun)
          .set({ heartbeatAt: new Date(), status: "starting" })
          .where(eq(humanTranscriptionRun.id, existing.id));
      }
      return { claim, run: existing };
    }
    const active = await tx
      .select({ id: humanTranscriptionRun.id })
      .from(humanTranscriptionRun)
      .where(
        inArray(humanTranscriptionRun.status, ["pending", "starting", "capturing", "finalizing"]),
      );
    const limit = Number(process.env.HUMAN_TRANSCRIPTION_MAX_MEETINGS ?? 8);
    if (!Number.isSafeInteger(limit) || limit < 1 || active.length >= limit) {
      throw new Error("实时转录容量已满，请稍后进入会议");
    }
    const [created] = await tx
      .insert(humanTranscriptionRun)
      .values({
        heartbeatAt: new Date(),
        id: crypto.randomUUID(),
        meetingId: scope.meeting.id,
        mode: scope.meeting.transcriptionMode,
        organizationId: scope.meeting.organizationId,
        participants: Object.fromEntries(
          scope.participants.map((p) => [p.identity, { displayName: p.name, role: p.role }]),
        ),
        recognitionHints: scope.hints,
        roomName,
        status: "starting",
      })
      .returning();
    if (!created) {
      throw new Error("转录任务创建失败");
    }
    return { claim: true, run: created };
  });
  const { run } = result;
  if (!result.claim || run.dispatchId || run.executionId) {
    return;
  }
  const { dispatch, room } = clients();
  await room.createRoom({ departureTimeout: 60, emptyTimeout: 300, name: roomName });
  // Persist the intent before calling LiveKit. On timeout, inspect its dispatch list.
  const metadata = JSON.stringify({
    generation: run.generation,
    kind: "human_interview_transcription",
    meetingId: run.meetingId,
    organizationId: run.organizationId,
    roomName,
    runId: run.id,
    schemaVersion: 1,
  });
  const dispatches = await dispatch.listDispatch(roomName);
  const matching = dispatches.find((item) => item.metadata === metadata);
  const item =
    matching ??
    (await dispatch.createDispatch(roomName, process.env.AGENT_NAME ?? "giaogiao", { metadata }));
  await db
    .update(humanTranscriptionRun)
    .set({ dispatchId: item.id })
    .where(
      and(
        eq(humanTranscriptionRun.id, run.id),
        eq(humanTranscriptionRun.generation, run.generation),
      ),
    );
}

export async function prepareHumanTranscription(roomName: string) {
  const scope = await loadTrackRecordingScope(roomName);
  if (!scope || scope.meeting.transcriptionMode === "legacy") {
    return;
  }
  try {
    await prepareHumanTranscriptionRun(roomName, scope);
  } catch (error) {
    if (scope.meeting.transcriptionMode !== "shadow") {
      throw error;
    }
    console.warn("shadow transcription unavailable; legacy meeting continues", {
      meetingId: scope.meeting.id,
    });
  }
}

export const requestHumanTranscriptionStop = createHumanTranscriptionStopper(db);

export async function acknowledgeHumanTranscriptionDownstream(runId: string) {
  await db
    .update(humanTranscriptionRun)
    .set({ downstreamRequestedAt: new Date() })
    .where(eq(humanTranscriptionRun.id, runId));
}

async function cleanupHumanTranscription(run: typeof humanTranscriptionRun.$inferSelect) {
  if (run.cleanupAt) {
    return;
  }
  if (run.mode === "shadow") {
    if (["ready", "needs_review"].includes(run.status)) {
      await db
        .update(humanTranscriptionRun)
        .set({ cleanupAt: new Date() })
        .where(eq(humanTranscriptionRun.id, run.id));
    }
    return;
  }
  if (!run.endedAt) {
    return;
  }
  const overdue = Date.now() - run.endedAt.getTime() > 30_000;
  if (!run.cutoffAt && !overdue) {
    return;
  }
  const { stopActiveHumanInterviewRecordingByRoomName } =
    await import("../utils/human-interview-recording-service");
  // Egress cleanup is independently retried by recording reconciliation. Room deletion
  // must not be held forever by an already-stopped Egress returning Precondition Failed.
  await stopActiveHumanInterviewRecordingByRoomName(run.roomName).catch(() => null);
  if (!run.drainedAt && !overdue) {
    return;
  }
  const { room } = clients();
  const rooms = await room.listRooms([run.roomName]);
  if (rooms.length) {
    await room.deleteRoom(run.roomName);
  }
  await db
    .update(humanTranscriptionRun)
    .set({ cleanupAt: new Date() })
    .where(eq(humanTranscriptionRun.id, run.id));
}

// oxlint-disable-next-line complexity -- reconciles persisted dispatch, lease takeover, cutoff and publication states.
export async function reconcileHumanTranscriptions() {
  const runs = await db
    .select()
    .from(humanTranscriptionRun)
    .where(
      or(
        inArray(humanTranscriptionRun.status, [
          "pending",
          "starting",
          "capturing",
          "finalizing",
          "recovering",
        ]),
        and(
          inArray(humanTranscriptionRun.status, ["ready", "needs_review"]),
          or(
            isNull(humanTranscriptionRun.cleanupAt),
            isNull(humanTranscriptionRun.downstreamRequestedAt),
          ),
        ),
      ),
    )
    .limit(100);
  const published: {
    runId: string;
    meetingSessionId: string;
    organizationId: string;
    eligible: boolean;
  }[] = [];
  const { createHumanRealtimeTranscriptDao } =
    await import("@app/meeting-processing/human-interview");
  const publisher = createHumanRealtimeTranscriptDao(db);
  for (const run of runs) {
    try {
      const [meeting] = await db
        .select()
        .from(humanInterviewMeeting)
        .where(eq(humanInterviewMeeting.id, run.meetingId));
      if (!meeting) {
        continue;
      }
      if (["ready", "needs_review"].includes(run.status)) {
        await cleanupHumanTranscription(run).catch(() => {
          console.warn("human transcription resource cleanup will retry", { runId: run.id });
        });
        if (
          !run.downstreamRequestedAt &&
          run.mode === "server_realtime" &&
          run.status === "ready" &&
          meeting.processingMeetingSessionId
        ) {
          published.push({
            eligible: true,
            meetingSessionId: meeting.processingMeetingSessionId,
            organizationId: run.organizationId,
            runId: run.id,
          });
        } else if (!run.downstreamRequestedAt) {
          await acknowledgeHumanTranscriptionDownstream(run.id);
        }
        continue;
      }
      if (["ended", "cancelled"].includes(meeting.status) && !run.endedAt) {
        await requestHumanTranscriptionStop(run.roomName);
      }
      if (!run.executionId && !run.endedAt && Date.now() - run.createdAt.getTime() < 60_000) {
        await prepareHumanTranscription(run.roomName);
        continue;
      }
      const abandoned = Date.now() - (run.heartbeatAt ?? run.createdAt).getTime() > 30_000;
      const overdue = run.endedAt && Date.now() - run.endedAt.getTime() > 30_000;
      if (
        (abandoned || run.status === "recovering") &&
        !run.endedAt &&
        ["scheduled", "in_progress"].includes(meeting.status) &&
        run.generation < 3
      ) {
        await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(humanTranscriptionRun)
            .where(eq(humanTranscriptionRun.id, run.id))
            .for("update");
          if (
            !current ||
            current.generation !== run.generation ||
            current.endedAt ||
            (current.status !== "recovering" &&
              (current.heartbeatAt?.getTime() ?? 0) > Date.now() - 30_000)
          ) {
            return;
          }
          let cursor = current.eventSeq;
          for (const identity of Object.keys(current.participants)) {
            cursor += 1;
            const eventId = crypto.randomUUID();
            await tx.insert(humanTranscriptionEvent).values({
              eventId,
              eventSeq: cursor,
              generation: run.generation,
              id: eventId,
              payload: {
                endMs: Math.max(0, Date.now() - (current.startedAt ?? current.createdAt).getTime()),
                eventId,
                itemId: eventId,
                kind: "gap",
                participantIdentity: identity,
                providerTaskId: "lease-expired",
                revision: 0,
                startMs: Math.max(
                  0,
                  (current.heartbeatAt ?? current.createdAt).getTime() -
                    (current.startedAt ?? current.createdAt).getTime(),
                ),
                streamEpoch: "lease-expired",
                text: "采集器失联",
                trackId: "unavailable",
              },
              runId: run.id,
            });
          }
          await tx
            .update(humanTranscriptionRun)
            .set({
              cutoffAt: null,
              dispatchId: null,
              drainedAt: null,
              error: "实时采集曾中断，需录音补救",
              eventSeq: cursor,
              executionId: null,
              generation: run.generation + 1,
              heartbeatAt: new Date(),
              status: "pending",
            })
            .where(eq(humanTranscriptionRun.id, run.id));
        });
        await prepareHumanTranscription(run.roomName);
        continue;
      }
      if (
        (abandoned || run.status === "recovering") &&
        !run.endedAt &&
        ["scheduled", "in_progress"].includes(meeting.status)
      ) {
        // The collector may fail; the human conversation and recording must continue.
        await db
          .update(humanTranscriptionRun)
          .set({ error: "实时采集不可用，会后将从录音恢复", status: "recovering" })
          .where(
            and(
              eq(humanTranscriptionRun.id, run.id),
              eq(humanTranscriptionRun.generation, run.generation),
            ),
          );
        continue;
      }
      if (abandoned || overdue) {
        await db
          .update(humanTranscriptionRun)
          .set({
            cutoffAt: run.cutoffAt ?? new Date(),
            drainedAt: run.drainedAt ?? new Date(),
            endedAt: run.endedAt ?? new Date(),
            error: run.drainedAt ? run.error : "实时采集器超时，等待录音补救",
            startedAt: run.startedAt ?? run.createdAt,
            status: "finalizing",
          })
          .where(
            and(
              eq(humanTranscriptionRun.id, run.id),
              eq(humanTranscriptionRun.generation, run.generation),
            ),
          );
      }
      await cleanupHumanTranscription(run).catch(() => {
        console.warn("human transcription resource cleanup will retry", { runId: run.id });
      });
      const result = await publisher.publish(run.id);
      if (result) {
        published.push({ ...result, runId: run.id });
      }
    } catch (error) {
      console.warn("human transcription reconciliation interrupted", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        runId: run.id,
      });
    }
  }
  return published;
}

export async function waitHumanTranscriptionReady(roomName: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [run] = await db
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.roomName, roomName));
    if (!run || run.mode === "shadow" || ["capturing", "recovering"].includes(run.status)) {
      return;
    }
    if (!["pending", "starting"].includes(run.status)) {
      throw new Error("实时转录未就绪，请稍后重试");
    }
    await delay(500);
  }
  throw new Error("实时转录准备超时，请稍后重新进入会议");
}
