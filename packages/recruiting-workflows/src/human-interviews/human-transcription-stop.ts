import { eq } from "drizzle-orm";
import type { Database } from "@app/database";
import { humanTranscriptionRun } from "@app/db-schema/schema";

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
        .set({ endedAt: run.endedAt ?? new Date(), status: "finalizing" })
        .where(eq(humanTranscriptionRun.id, run.id))
        .returning();
      return updated;
    });
}
