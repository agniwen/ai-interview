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

// LiveKit 约 15 秒才发现采集器掉线并重新派发，派发本身也可能延迟；租约过短会把
// 尚在启动的采集器误判为失联，提升代次后让晚到的旧任务认领失败并留下转录缺口。
const COLLECTOR_LEASE_MS = 60_000;

/** 采集器心跳是否已超过租约；从未上报心跳视为已过期。 */
export function isCollectorLeaseExpired(lastSeenAt: Date | null, now = new Date()): boolean {
  return !lastSeenAt || now.getTime() - lastSeenAt.getTime() > COLLECTOR_LEASE_MS;
}
