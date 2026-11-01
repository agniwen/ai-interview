import { eq } from "drizzle-orm";
import type { Database } from "@app/database";
import { humanTranscriptionRun } from "@app/db-schema/schema";

type HumanTranscriptionRun = typeof humanTranscriptionRun.$inferSelect;

/** 会议结束时的收尾补丁；没有采集器认领的任务无音频可排空，直接进入可发布状态。 */
export function buildHumanTranscriptionStopPatch(
  run: Pick<HumanTranscriptionRun, "cutoffAt" | "drainedAt" | "endedAt" | "executionId">,
  now: Date,
): Partial<HumanTranscriptionRun> {
  const patch: Partial<HumanTranscriptionRun> = {
    endedAt: run.endedAt ?? now,
    status: "finalizing",
  };
  if (!run.executionId) {
    patch.cutoffAt = run.cutoffAt ?? now;
    patch.drainedAt = run.drainedAt ?? now;
  }
  return patch;
}

export function createHumanTranscriptionStopper(database: Database) {
  return (roomName: string) =>
    database.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(humanTranscriptionRun)
        .where(eq(humanTranscriptionRun.roomName, roomName))
        .for("update");
      if (!run || !["pending", "starting", "capturing", "recovering"].includes(run.status)) {
        return run;
      }
      const [updated] = await tx
        .update(humanTranscriptionRun)
        .set(buildHumanTranscriptionStopPatch(run, new Date()))
        .where(eq(humanTranscriptionRun.id, run.id))
        .returning();
      return updated;
    });
}
