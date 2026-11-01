import { and, eq } from "drizzle-orm";
import type { Database } from "@app/database";
import { humanTranscriptionRun } from "@app/db-schema/schema";
import type { HumanTranscriptionCallback } from "@app/shared/human-transcription";
import { db } from "../../../../infrastructure/db/index";
import { HumanTranscriptionConflictError } from "./errors";

type HumanTranscriptionRun = typeof humanTranscriptionRun.$inferSelect;

function isLosslessIdleExit(
  run: HumanTranscriptionRun,
  idle: boolean,
  error: string | null | undefined,
): boolean {
  return idle && !error && !run.error && !run.endedAt;
}

// 无人可采时采集器退出不丢音频：清空执行权，等下一位参会者入会时以新代次重新派发。
function idleResumePatch(run: HumanTranscriptionRun, now: Date): Partial<HumanTranscriptionRun> {
  return {
    cutoffAt: null,
    dispatchId: null,
    drainedAt: null,
    executionId: null,
    generation: run.generation + 1,
    heartbeatAt: now,
    status: "pending",
  };
}

export function createHumanTranscriptionFinisher(database: Database) {
  return (
    job: HumanTranscriptionCallback,
    phase: "ready" | "cutoff" | "finish",
    error?: string | null,
    idle = false,
  ) =>
    database.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(humanTranscriptionRun)
        .where(
          and(
            eq(humanTranscriptionRun.id, job.runId),
            eq(humanTranscriptionRun.organizationId, job.organizationId),
            eq(humanTranscriptionRun.meetingId, job.meetingId),
            eq(humanTranscriptionRun.roomName, job.roomName),
            eq(humanTranscriptionRun.generation, job.generation),
            eq(humanTranscriptionRun.executionId, job.executionId),
          ),
        )
        .for("update");
      if (!run) {
        throw new HumanTranscriptionConflictError("收尾任务已失去写入权");
      }
      // Replays acknowledge an already-applied transition without reopening a terminal run.
      if (["ready", "needs_review"].includes(run.status)) {
        if (phase !== "ready" && run.drainedAt) {
          return { ok: true };
        }
        throw new HumanTranscriptionConflictError("转录任务已结束");
      }
      if (phase === "ready" && ["finalizing", "recovering"].includes(run.status)) {
        return { ok: true, stop: true };
      }
      if (!["starting", "capturing", "finalizing", "recovering"].includes(run.status)) {
        throw new HumanTranscriptionConflictError("转录任务状态不允许收尾");
      }
      const now = new Date();
      let patch: Partial<typeof humanTranscriptionRun.$inferInsert> = {
        heartbeatAt: now,
        status: "capturing",
      };
      if (phase !== "ready") {
        patch = {
          cutoffAt: run.cutoffAt ?? now,
          // Only an explicit meeting stop may establish endedAt. A collector
          // can drain because of a failure while the human conversation continues.
          status: run.endedAt ? "finalizing" : run.status,
        };
      }
      if (phase === "finish" && isLosslessIdleExit(run, idle, error)) {
        patch = idleResumePatch(run, now);
      } else if (phase === "finish") {
        Object.assign(patch, {
          drainedAt: run.drainedAt ?? now,
          error: run.error ?? error ?? (run.endedAt ? null : "采集器已退出，等待恢复实时转录"),
          heartbeatAt: now,
          status: run.endedAt ? "finalizing" : "recovering",
        });
      }
      await tx.update(humanTranscriptionRun).set(patch).where(eq(humanTranscriptionRun.id, run.id));
      return { ok: true };
    });
}
export const finishHumanTranscription = createHumanTranscriptionFinisher(db);
