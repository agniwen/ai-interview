"use client";

import type { ChatStatus } from "ai";
import { useCallback, useEffect, useRef } from "react";
import {
  getStreamRecoveryDecision,
  getStreamRecoveryDelayMs,
  shouldScheduleStallRecovery,
} from "./stream-recovery-policy";
import type { RetryChatStreamOptions } from "./use-chat-runtime";

/**
 * 浏览器回到前台 / 网络恢复 / 流卡死时的自动续接钩子。
 *
 * 触发路径(见 `stream-recovery-policy.ts:getStreamRecoveryDecision`):
 *  1. 事件触发 (visibility / focus / online): 在 `error` 或 `visibility + ready`
 *     或 `submitted 卡 stall_ms 没出内容` 三种状态下调一次 retry。
 *  2. Stall 定时器: 进入 in-flight 后挂一个 `setTimeout(stallMs - elapsed)`,
 *     即便用户没碰浏览器, 卡 4s 也会自动 probe 一次。这一步对 iOS Safari
 *     "后台节流后切回, 但 visibilitychange 已经早于 stall 触发"的边界场景兜底。
 *
 * 决策都从 `stream-recovery-policy.ts` 拿(可单测), hook 这里只负责事件接线 +
 * setTimeout 调度。
 *
 * Auto-resume on visibility/online/focus + an idle stall timer.
 *
 *  1. Event-driven: visibility/focus/online → check policy → maybe retry.
 *  2. Stall timer: while in-flight without content, schedule a single
 *     `setTimeout(stallMs - elapsed)` so even an idle user gets a probe after
 *     the stream has been silent past the stall threshold.
 *
 * Decisions live in `stream-recovery-policy.ts` (testable); this hook only
 * wires up listeners and the timer.
 */

interface UseStreamRecoveryParams {
  /** 当前会话 id; null 时直接跳过监听 (e.g. /chat 新建路径)。 */
  /** Current chatId; listeners skipped when null. */
  chatId: string | null;
  /** 当前 chat status (来自 useChat)。 */
  /** Current chat status from useChat. */
  status: ChatStatus;
  /** 末尾消息是否是带可见内容的 assistant (用 hasRenderableAssistantPart 判断)。 */
  /** Whether trailing message is a renderable assistant — judged by
   * `hasRenderableAssistantPart` not just `parts.length`. */
  hasAssistantContent: boolean;
  retryChatStream: (opts?: RetryChatStreamOptions) => void;
}

function isChatInFlight(status: ChatStatus): boolean {
  return status === "submitted" || status === "streaming";
}

export function useStreamRecovery({
  chatId,
  status,
  hasAssistantContent,
  retryChatStream,
}: UseStreamRecoveryParams): void {
  // 把动态值塞进 ref, 让 listener effect 的 deps 只剩 chatId 不抖。
  // Stash dynamic values in refs so listener identity stays stable.
  const retryRef = useRef(retryChatStream);
  retryRef.current = retryChatStream;
  const statusRef = useRef(status);
  statusRef.current = status;
  const hasAssistantContentRef = useRef(hasAssistantContent);
  hasAssistantContentRef.current = hasAssistantContent;

  // 上次触发时间(节流) + 当前 in-flight 起点(stall 计时)。
  // Last recovery trigger (throttle) + in-flight start (stall timing).
  const lastRecoveryAtRef = useRef(0);
  const inFlightStartedAtRef = useRef<number | null>(null);

  /**
   * 单一决策入口: 走 policy 判断, 决定 OK 后调 retry 并刷新节流戳。
   * Single recovery decision point: ask the policy, retry if OK, bump
   * the throttle timestamp.
   */
  const maybeRecover = useCallback((opts?: { isVisibilityRecovery?: boolean }) => {
    const now = Date.now();
    const decision = getStreamRecoveryDecision({
      hasAssistantRenderableContent: hasAssistantContentRef.current,
      inFlightStartedAt: inFlightStartedAtRef.current,
      isVisibilityRecovery: opts?.isVisibilityRecovery,
      lastRecoveryAt: lastRecoveryAtRef.current,
      now,
      status: statusRef.current,
    });
    if (decision === "none") {
      return;
    }
    lastRecoveryAtRef.current = now;
    retryRef.current({ auto: true });
  }, []);

  // 跟踪 in-flight 起点 —— 进入 submitted/streaming 时记一下时间戳, 退出时清掉,
  // 给 stall 定时器和 policy 用。
  // Track in-flight start so policy + stall timer know elapsed time.
  useEffect(() => {
    if (isChatInFlight(status)) {
      if (inFlightStartedAtRef.current === null) {
        inFlightStartedAtRef.current = Date.now();
      }
      return;
    }
    inFlightStartedAtRef.current = null;
  }, [status]);

  // 事件监听: visibilitychange / focus / online。
  // Listeners.
  useEffect(() => {
    if (!chatId) {
      return;
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        maybeRecover({ isVisibilityRecovery: true });
      }
    };
    const onFocus = () => {
      maybeRecover({ isVisibilityRecovery: true });
    };
    const onOnline = () => {
      maybeRecover();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [chatId, maybeRecover]);

  // Stall 定时器: in-flight 中且文档可见且没有可见内容时, 挂一个 setTimeout, 到点后
  // 走一次 maybeRecover —— 给 iOS Safari 后台节流恢复后流没自动恢复的兜底。
  // Stall timer: when in flight + visible + no content, fire maybeRecover
  // after the remaining stall budget elapses.
  useEffect(() => {
    const isDocumentVisible =
      typeof document === "undefined" || document.visibilityState === "visible";

    if (
      !shouldScheduleStallRecovery({
        hasAssistantRenderableContent: hasAssistantContent,
        isChatInFlight: isChatInFlight(status),
        isDocumentVisible,
      })
    ) {
      return;
    }

    const waitMs = getStreamRecoveryDelayMs({
      inFlightStartedAt: inFlightStartedAtRef.current,
      now: Date.now(),
    });
    const timeout = setTimeout(() => {
      maybeRecover();
    }, waitMs);
    return () => {
      clearTimeout(timeout);
    };
  }, [status, hasAssistantContent, maybeRecover]);
}
