import { streamSSE } from "hono/streaming";
import { and, eq, gt } from "drizzle-orm";
import {
  humanInterviewMeeting,
  humanTranscriptionRun,
  humanTranscriptionEvent,
} from "@app/db-schema/schema";
import { factory } from "../../../../factory";
import { db } from "../../../../../lib/server/db/index";
import { resolveHumanInterviewMeetingInterviewerInviteToken } from "../../../studio/routes/interviews/dao/human-interview-meetings";

export const serverTranscriptRouter = factory
  .createApp()
  .get("/:inviteToken/server-transcript", async (c) => {
    const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(
      c.req.param("inviteToken"),
    );
    if (!scope || scope.role === "observer") {
      return c.json({ error: "没有字幕访问权限" }, 403);
    }
    const [meeting] = await db
      .select()
      .from(humanInterviewMeeting)
      .where(
        and(
          eq(humanInterviewMeeting.id, scope.meetingId),
          eq(humanInterviewMeeting.organizationId, scope.organizationId),
        ),
      );
    if (!meeting) {
      return c.json({ error: "会议不存在" }, 404);
    }
    const [run] = await db
      .select()
      .from(humanTranscriptionRun)
      .where(eq(humanTranscriptionRun.meetingId, meeting.id));
    c.header("Cache-Control", "no-store");
    if (c.req.query("stream") !== "1" || !run) {
      return c.json({
        executionId: run?.executionId ?? null,
        generation: run?.generation ?? null,
        mode: meeting.transcriptionMode,
        participants: run?.participants ?? {},
        runId: run?.id ?? null,
        status: run?.status ?? "pending",
      });
    }
    let cursor = Math.max(0, Number(c.req.header("Last-Event-ID") ?? c.req.query("cursor") ?? 0));
    if (!Number.isSafeInteger(cursor)) {
      return c.json({ error: "游标无效" }, 400);
    }
    return streamSSE(c, async (stream) => {
      const deadline = Date.now() + 60_000;
      while (!stream.aborted && Date.now() < deadline) {
        const rows = await db
          .select()
          .from(humanTranscriptionEvent)
          .where(
            and(
              eq(humanTranscriptionEvent.runId, run.id),
              gt(humanTranscriptionEvent.eventSeq, cursor),
            ),
          )
          .orderBy(humanTranscriptionEvent.eventSeq)
          .limit(100);
        const [current] = await db
          .select({
            error: humanTranscriptionRun.error,
            executionId: humanTranscriptionRun.executionId,
            generation: humanTranscriptionRun.generation,
            status: humanTranscriptionRun.status,
          })
          .from(humanTranscriptionRun)
          .where(eq(humanTranscriptionRun.id, run.id));
        if (!current) {
          break;
        }
        cursor = rows.at(-1)?.eventSeq ?? cursor;
        await stream.writeSSE({
          data: JSON.stringify({
            error: current.error,
            events: rows.map((row) => row.payload),
            executionId: current.executionId,
            generation: current.generation,
            runId: run.id,
            status: current.status,
          }),
          id: String(cursor),
        });
        if (["ready", "failed", "needs_review"].includes(current.status) && rows.length < 100) {
          break;
        }
        if (rows.length < 100) {
          await stream.sleep(1000);
        }
      }
    });
  });
