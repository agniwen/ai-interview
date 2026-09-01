import type { InterviewNotificationEventRecord } from "./dao";

// 未配置时每 5 秒尝试认领一批通知事件。 / Attempts to claim a notification batch every five seconds by default.
const DEFAULT_INTERVAL_MS = 5000;
// 默认每轮最多处理 20 个事件，运行时另有 100 的硬上限。 / Processes at most 20 events per run by default, with a runtime hard cap of 100.
const DEFAULT_BATCH_SIZE = 20;
// 两分钟租约允许其他实例在 Worker 中断后重新认领事件。 / A two-minute lease lets another instance reclaim an event after interruption.
const EVENT_LEASE_DURATION_MS = 120_000;

export interface InterviewNotificationSchedulerSnapshot {
  claimed: number;
  enabled: boolean;
  lastErrorAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  running: boolean;
}

export interface InterviewNotificationSchedulerDependencies {
  claimEvents(input: {
    leaseDurationMs: number;
    leaseOwner: string;
    limit: number;
    now?: Date;
  }): Promise<InterviewNotificationEventRecord[]>;
  processEvent(event: InterviewNotificationEventRecord, leaseOwner: string): Promise<void>;
}

// 进程内诊断快照由每轮轮询更新，并通过受保护端点读取。 / In-process diagnostics updated each poll and exposed through the protected operations endpoint.
let snapshot: InterviewNotificationSchedulerSnapshot = {
  claimed: 0,
  enabled: false,
  lastErrorAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  running: false,
};

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

// 仅在流程与 Worker 开关同时开启时启用调度。 / Enables scheduling only when both flow and Worker flags are on.
function enabledFromEnv(): boolean {
  const worker = process.env.INTERVIEW_NOTIFICATION_WORKER_ENABLED?.trim().toLowerCase();
  const flow = process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED?.trim().toLowerCase();
  return truthy(flow) && truthy(worker);
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// 返回副本，防止诊断调用方改写调度器的进程内状态。 / Returns a copy so diagnostics callers cannot mutate scheduler state.
export function getInterviewNotificationSchedulerSnapshot(): InterviewNotificationSchedulerSnapshot {
  return { ...snapshot };
}

export interface InterviewNotificationScheduler {
  close(): void;
  runOnce(): Promise<void>;
}

// 启动单飞轮询；一次运行未结束时跳过重复触发，并支持显式关闭。 / Starts single-flight polling, skipping overlapping triggers and supporting explicit shutdown.
export function startInterviewNotificationScheduler(
  dependencies: InterviewNotificationSchedulerDependencies,
): InterviewNotificationScheduler | null {
  if (!enabledFromEnv()) {
    snapshot = { ...snapshot, enabled: false, running: false };
    console.info(
      "[interview-notification-worker] disabled; enable both notification flow and Worker flags to start polling",
    );
    return null;
  }

  const intervalMs = positiveInteger(
    process.env.INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
  );
  const batchSize = Math.min(
    positiveInteger(process.env.INTERVIEW_NOTIFICATION_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    100,
  );
  const leaseOwner = `notification-worker:${process.pid}:${crypto.randomUUID()}`;
  let closed = false;
  let running = false;

  const runOnce = async () => {
    if (closed || running) {
      return;
    }
    running = true;
    const runAt = new Date();
    snapshot = { ...snapshot, enabled: true, lastRunAt: runAt.toISOString(), running: true };
    try {
      let claimed = 0;
      while (claimed < batchSize) {
        const [event] = await dependencies.claimEvents({
          leaseDurationMs: EVENT_LEASE_DURATION_MS,
          leaseOwner,
          limit: 1,
          now: new Date(),
        });
        if (!event) {
          break;
        }
        claimed += 1;
        await dependencies.processEvent(event, leaseOwner);
      }
      snapshot = { ...snapshot, claimed };
      snapshot = { ...snapshot, lastSuccessAt: new Date().toISOString() };
    } catch (error) {
      snapshot = { ...snapshot, lastErrorAt: new Date().toISOString() };
      console.error("[interview-notification-worker] poll failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      running = false;
      snapshot = { ...snapshot, running: false };
    }
  };

  const triggerRun = async () => {
    await runOnce();
  };
  const timer = setInterval(triggerRun, intervalMs);
  timer.unref();
  queueMicrotask(triggerRun);
  console.info("[interview-notification-worker] scheduler started", { batchSize, intervalMs });

  return {
    close: () => {
      closed = true;
      clearInterval(timer);
      snapshot = { ...snapshot, running: false };
    },
    runOnce,
  };
}
