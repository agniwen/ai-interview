import type { humanTranscriptionRun } from "@app/db-schema/schema";

/** 采集器在无人可采时正常退出后的等待态；与失联恢复不同，它没有错误也没有执行者。 */
export function isIdleHumanTranscriptionRun(
  run: Pick<
    typeof humanTranscriptionRun.$inferSelect,
    "dispatchId" | "endedAt" | "error" | "executionId" | "status"
  >,
): boolean {
  return (
    run.status === "pending" && !run.dispatchId && !run.executionId && !run.error && !run.endedAt
  );
}
