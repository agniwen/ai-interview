import type { ChatStatus } from "ai";

/**
 * 恢复策略的纯函数集合, 跟 hook 解耦, 单测覆盖。
 * 对齐 open-agents `apps/web/app/sessions/.../stream-recovery-policy.ts`
 * 但裁剪掉 `probe` 分支 —— 我们没有独立的 server-side probe 端点, `/stream`
 * 端点本身在没有活跃 run 时已经返"finish only" 空流(由 emptyFinishedStreamResponse
 * 统一处理, 不再 204), 所以 retry 就是 probe, 不需要单独 decision。
 *
 * Pure functions extracted so behaviour is testable without React.
 * Mirrors open-agents `stream-recovery-policy.ts` minus the separate `probe`
 * decision: our `/stream` endpoint already returns finish-only when no run
 * is live (emptyFinishedStreamResponse), so retrying directly is equivalent
 * to probing — one decision suffices.
 */

export const STREAM_RECOVERY_STALL_MS = 4000;
export const STREAM_RECOVERY_MIN_INTERVAL_MS = 8000;

export type StreamRecoveryDecision = "none" | "retry";

/**
 * 决定是否要触发一次自动恢复。
 *  - 节流: 距上次恢复不足 minIntervalMs 一律 none。
 *  - status === "error": 直接 retry —— 网络 / fetch 已经报错, 不重连等于卡死。
 *  - 切回前台 + status === "ready": 浏览器后台节流可能悄悄断了流, 试一次 retry,
 *    server 没活动 run 也只是返 finish only, 开销可控。
 *  - status === "submitted" 且没助手内容 + 持续超过 stallMs: 提交卡住了, retry。
 *  - 其他: none。
 *
 * Decide whether to trigger auto-recovery now.
 *  - Throttled by minIntervalMs.
 *  - `error`: always retry — local fetch errored, leaving it idle = stuck.
 *  - Visibility recovery + `ready`: silent backgrounded fetch may have died;
 *    a retry is cheap (the endpoint returns finish-only when no run).
 *  - `submitted` + no assistant content + > stallMs in flight: stalled.
 *  - Otherwise: none.
 */
export function getStreamRecoveryDecision(options: {
  now: number;
  lastRecoveryAt: number;
  status: ChatStatus;
  hasAssistantRenderableContent: boolean;
  inFlightStartedAt: number | null;
  isVisibilityRecovery?: boolean;
  minIntervalMs?: number;
  stallMs?: number;
}): StreamRecoveryDecision {
  const {
    now,
    lastRecoveryAt,
    status,
    hasAssistantRenderableContent,
    inFlightStartedAt,
    isVisibilityRecovery = false,
    minIntervalMs = STREAM_RECOVERY_MIN_INTERVAL_MS,
    stallMs = STREAM_RECOVERY_STALL_MS,
  } = options;

  if (now - lastRecoveryAt < minIntervalMs) {
    return "none";
  }

  if (status === "error") {
    return "retry";
  }

  // 切回前台 + 闲置(ready): 浏览器可能在后台杀了连接。
  // Visibility recovery + idle: backgrounded fetch may have been killed.
  if (isVisibilityRecovery && status === "ready") {
    return "retry";
  }

  // submitted 但没收到任何可见 assistant 内容: 卡住了。
  // submitted but no assistant content visible: stalled.
  if (status !== "submitted" || hasAssistantRenderableContent) {
    return "none";
  }

  if (inFlightStartedAt === null || now - inFlightStartedAt < stallMs) {
    return "none";
  }

  return "retry";
}

/**
 * 是否应该挂一个 stall 检测的 setTimeout。
 *  - 必须在 in-flight 中(submitted/streaming) 且没有可见内容。
 *  - tab 不可见时不挂 —— 浏览器节流, 计时不准。
 *
 * Whether to schedule a stall-detection timeout.
 *  - Only while in-flight without renderable content.
 *  - Skip when tab hidden (browser throttling makes timers unreliable).
 */
export function shouldScheduleStallRecovery(options: {
  isChatInFlight: boolean;
  hasAssistantRenderableContent: boolean;
  isDocumentVisible: boolean;
}): boolean {
  return (
    options.isChatInFlight && !options.hasAssistantRenderableContent && options.isDocumentVisible
  );
}

/**
 * 距 stall 触发还要等多久。
 * How long until the stall threshold trips for the current in-flight request.
 */
export function getStreamRecoveryDelayMs(options: {
  now: number;
  inFlightStartedAt: number | null;
  stallMs?: number;
}): number {
  const { now, inFlightStartedAt, stallMs = STREAM_RECOVERY_STALL_MS } = options;
  const elapsed = inFlightStartedAt === null ? 0 : now - inFlightStartedAt;
  return Math.max(0, stallMs - elapsed);
}
