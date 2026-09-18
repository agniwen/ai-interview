import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@app/database";
import {
  humanTranscriptionRun,
  humanTranscriptionEvent,
  humanInterviewMeeting,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewMeetingInterviewer,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  recruitingMeetingContext,
} from "@app/db-schema/schema";
import { rebuildMeetingSearchProjection } from "./meeting-search-projection";
import { projectHumanTranscription } from "@app/shared/human-transcription-projection";

export function createHumanRealtimeTranscriptDao(db: Database) {
  function publish(runId: string) {
    // oxlint-disable-next-line complexity -- publication atomically fences runs, binds recruiting context and preserves material quality.
    return db.transaction(async (tx) => {
      const [reference] = await tx
        .select()
        .from(humanTranscriptionRun)
        .where(eq(humanTranscriptionRun.id, runId))
        .limit(1);
      if (!reference) {
        return null;
      }
      const [meeting] = await tx
        .select()
        .from(humanInterviewMeeting)
        .where(
          and(
            eq(humanInterviewMeeting.id, reference.meetingId),
            eq(humanInterviewMeeting.organizationId, reference.organizationId),
          ),
        )
        .for("update");
      if (!meeting || !["ended", "cancelled"].includes(meeting.status)) {
        return null;
      }
      const [run] = await tx
        .select()
        .from(humanTranscriptionRun)
        .where(eq(humanTranscriptionRun.id, runId))
        .for("update");
      if (
        !run?.drainedAt ||
        !run.startedAt ||
        !run.endedAt ||
        ["ready", "needs_review"].includes(run.status)
      ) {
        return null;
      }
      const events = await tx
        .select()
        .from(humanTranscriptionEvent)
        .where(eq(humanTranscriptionEvent.runId, run.id))
        .orderBy(humanTranscriptionEvent.eventSeq);
      const projection = projectHumanTranscription(
        events.map((row) => row.payload),
        run.participants,
      );
      const snapshot = {
        cursor: run.eventSeq,
        gaps: projection.gaps,
        generation: run.generation,
        runId: run.id,
        sha256: createHash("sha256")
          .update(
            JSON.stringify({
              endedAt: run.endedAt,
              error: run.error,
              events,
              mode: run.mode,
              participants: run.participants,
              recognitionHints: run.recognitionHints,
              startedAt: run.startedAt,
            }),
          )
          .digest("hex"),
      };
      const closedEpochs = new Set(
        events
          .filter((row) => row.payload.kind === "stream_ended")
          .map((row) => row.payload.streamEpoch),
      );
      const incompleteStreams = events.some(
        (row) =>
          row.payload.kind === "stream_started" && !closedEpochs.has(row.payload.streamEpoch),
      );
      const eligible =
        projection.eligible && !incompleteStreams && !run.error && meeting.status !== "cancelled";
      if (run.mode === "shadow") {
        await tx
          .update(humanTranscriptionRun)
          .set({ sourceSnapshot: snapshot, status: eligible ? "ready" : "needs_review" })
          .where(eq(humanTranscriptionRun.id, run.id));
        return null;
      }
      if (meeting.processingMeetingSessionId) {
        // A recording recovery or human edit won the publication race. Preserve it.
        await tx
          .update(humanTranscriptionRun)
          .set({
            error: "已有正式材料，请人工复核实时转录",
            sourceSnapshot: snapshot,
            status: "needs_review",
          })
          .where(eq(humanTranscriptionRun.id, run.id));
        return null;
      }
      const [round] = await tx
        .select({ recordId: humanInterviewRound.recruitingRecordId })
        .from(humanInterviewMeetingRound)
        .innerJoin(
          humanInterviewRound,
          eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId),
        )
        .where(eq(humanInterviewMeetingRound.meetingId, meeting.id));
      const [host] = await tx
        .select()
        .from(humanInterviewMeetingInterviewer)
        .where(eq(humanInterviewMeetingInterviewer.meetingId, meeting.id));
      const ownerId = meeting.createdBy ?? host?.userId;
      if (!round || !ownerId) {
        throw new Error("会议缺少候选人或负责人");
      }
      const sessionId = crypto.randomUUID();
      const revisionId = crypto.randomUUID();

      await tx.insert(meetingSession).values({
        custodianId: ownerId,
        id: sessionId,
        manifestSha256: null,
        organizationId: run.organizationId,
        ownerId,
        realtimeRunId: run.id,
        savedAt: run.endedAt,
        sourceKind: "livekit_realtime",
        startedAt: run.startedAt,
        status: "ready",
        title: meeting.title,
        transcriptionError: eligible
          ? null
          : (run.error ?? "实时转录材料不完整，请复核或等待录音补救"),
        transcriptionStatus: eligible ? "ready" : "failed",
        verifiedAt: new Date(),
      });
      await tx.insert(meetingTranscriptRevision).values({
        id: revisionId,
        kind: "realtime",
        language: "zh-CN",
        meetingId: sessionId,
        model: "qwen-audio-3.0-asr-flash-streaming",
        organizationId: run.organizationId,
        pipelineVersion: "human-realtime-v1",
        provider: "qwen",
        quality: eligible ? "eligible" : "needs_review",
        realtimeRunId: run.id,
        region: "cn-beijing",
        revision: 1,
        sourceSnapshot: snapshot,
      });
      if (projection.turns.length) {
        await tx.insert(meetingTranscriptTurn).values(
          projection.turns.map((turn, sequence) => ({
            ...turn,
            id: crypto.randomUUID(),
            revisionId,
            sequence,
          })),
        );
      }
      await tx
        .update(meetingSession)
        .set(
          eligible
            ? { activeTranscriptRevisionId: revisionId }
            : { reviewTranscriptRevisionId: revisionId },
        )
        .where(eq(meetingSession.id, sessionId));
      await tx.insert(recruitingMeetingContext).values({
        linkedAt: new Date(),
        linkedBy: ownerId,
        meetingId: sessionId,
        organizationId: run.organizationId,
        recruitingRecordId: round.recordId,
      });
      await tx
        .update(humanInterviewMeeting)
        .set({ processingMeetingSessionId: sessionId })
        .where(eq(humanInterviewMeeting.id, meeting.id));
      await tx
        .update(humanTranscriptionRun)
        .set({ sourceSnapshot: snapshot, status: eligible ? "ready" : "needs_review" })
        .where(eq(humanTranscriptionRun.id, run.id));
      await rebuildMeetingSearchProjection(tx, {
        meetingId: sessionId,
        organizationId: run.organizationId,
      });
      return { eligible, meetingSessionId: sessionId, organizationId: run.organizationId };
    });
  }
  return { publish };
}
