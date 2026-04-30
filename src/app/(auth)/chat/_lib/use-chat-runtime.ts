"use client";

import type { UIMessage } from "ai";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { upsertChatMessageOnServer } from "@/lib/chat-api";
import { notifyConversationsChanged } from "./chat-events";
import { abortChatInstanceTransport, getOrCreateChatInstance } from "./chat-instance-manager";
import { cleanupChatRouteOnUnmount } from "./chat-route-cleanup";
import { AbortableWorkflowChatTransport } from "./chat-transport";

const CHAT_UI_UPDATE_THROTTLE_MS = 50;

export interface UseChatRuntimeArgs {
  /**
   * 当前路由对应的 chatId。`/chat` 新建会话时为 null，发送首条消息且 URL 升级到 `/chat/:id` 后
   * 由父组件赋值；hook 内部会根据 chatId 是否存在决定是否构造 Chat 实例。
   *
   * The chatId for the current route. `null` while on `/chat` (a brand-new
   * conversation) and set by the parent once the URL is promoted to
   * `/chat/:id`. The hook short-circuits when chatId is null.
   */
  chatId: string | null;
  /**
   * 服务端 SSR 注入的初始消息（仅在 `chatId === initialConversationId` 时使用）。
   * Initial messages from the SSR snapshot — only used when the chat instance
   * is being created for the first time AND the chatId matches.
   */
  initialMessages?: UIMessage[];
  /**
   * 服务端 SSR 注入的 active workflow runId，决定 mount 是否触发 resumeStream。
   * Server-injected active workflow runId — drives the mount-time resume
   * decision.
   */
  initialActiveWorkflowRunId?: string | null;
  /**
   * 当前的 JD 文本。会被同步到 ref，供 transport 闭包在每次 sendMessages 时读取最新值。
   * Current JD text — mirrored to a ref so the transport closure can read the
   * latest value on every send.
   */
  jobDescriptionText: string;
  /**
   * 思考模式开关；同上以 ref 形式同步给 transport。
   * Thinking-mode flag — mirrored to a ref the same way.
   */
  enableThinking: boolean;
}

export interface UseChatRuntimeReturn {
  /**
   * useChat 的全部 helpers。chatId 为 null 时，仍然返回一个 throwaway useChat
   * 结果，messages/status 等同于全新会话；调用方根据 chatId 决定要不要派发。
   * Full useChat helpers. When chatId is null we still return useChat output
   * backed by a throwaway internal Chat — so the caller can keep rendering
   * without conditional hooks. They simply shouldn't dispatch sends through
   * it; that's the parent's responsibility once a chatId exists.
   */
  chat: UseChatHelpers<UIMessage>;
  /** Whether the hook owns a real Chat instance bound to a chatId. */
  hasBoundChat: boolean;
  /** Stop the current stream. Sets userStopped so probe/auto-recovery respects it. */
  stopChatStream: () => void;
  /**
   * 重连到服务端流。
   *  - 默认 (`{}` / 无参) 等价于"用户主动点重试": 强制清掉 user-stopped 标志, 走 hard
   *    策略 (先 stop + abort transport 再 resumeStream)。
   *  - `{ auto: true }`: 自动恢复路径 (visibilitychange / online / 焦点回归 等触发),
   *    若 userStopped=true 则只 `clearError()` 不重连; 默认 strategy='soft' 跳过本地
   *    teardown, 直接 resumeStream, 避免在已经能用的连接上引入断点。
   *  - `strategy`: 'hard' = 先 chat.stop() + abortChatInstanceTransport 再
   *    resumeStream; 'soft' = 只 clearError + resumeStream。
   *
   * Reconnect to the server stream.
   *  - Default (no args) ≈ "user clicked retry": clears userStopped and uses
   *    'hard' strategy (stop + abort transport, then resumeStream).
   *  - `{ auto: true }`: auto-recovery path (visibility / online / focus). When
   *    userStopped is set, only `clearError()` runs — respect the user's intent.
   *    Defaults to 'soft' strategy to avoid tearing down a still-working
   *    connection.
   *  - `strategy`: 'hard' tears down before reconnect; 'soft' just resumes.
   */
  retryChatStream: (opts?: RetryChatStreamOptions) => void;
}

export interface RetryChatStreamOptions {
  /** True when triggered by an auto-recovery handler (visibility/online/focus). */
  auto?: boolean;
  /** Override the strategy. Default: 'soft' for auto, 'hard' for manual. */
  strategy?: "hard" | "soft";
}

async function persistPartialMessage(chatId: string, message: UIMessage) {
  try {
    await upsertChatMessageOnServer(chatId, message);
  } catch (persistError) {
    console.error("[chat] client-side persist failed", persistError);
  }
}

/**
 * 把 useChat / transport / Chat 实例 / resume 决策全部组装在一处。
 * 行为对齐 open-agents 的 `useSessionChatRuntime`:
 *   - per-chatId 的 instance 来自 `chat-instance-manager` 的 Map（不 LRU）
 *   - mount 时 `useRef(initialValue)` 一次性算出 `shouldResume`，借助 `alreadyExisted`
 *     + 当前 chat status 防止 React StrictMode 双挂载导致的重复 resumeStream
 *   - reactive resume probe: `[0, 1s, 2.5s, 5.5s, 10s]` backoff 探测 active stream
 *   - 路由 unmount 通过 `cleanupChatRouteOnUnmount` 仅 abort 本地 fetch，不 stop 服务端
 *     workflow，让后台 generation 继续
 *
 * Mirrors open-agents' `useSessionChatRuntime` — single hook owns transport,
 * Chat instance, resume policy, retry, probe, cleanup.
 */
export function useChatRuntime(args: UseChatRuntimeArgs): UseChatRuntimeReturn {
  const { chatId, initialMessages, initialActiveWorkflowRunId } = args;

  // 1. 把 jd / thinking 同步到 ref, 让 transport 闭包每次 send 都能读到最新值。
  // 1. Sync jd / thinking to refs so the transport closure reads the latest
  //    values on every sendMessages invocation.
  const jobDescriptionRef = useRef(args.jobDescriptionText);
  const enableThinkingRef = useRef(args.enableThinking);
  useEffect(() => {
    jobDescriptionRef.current = args.jobDescriptionText;
  }, [args.jobDescriptionText]);
  useEffect(() => {
    enableThinkingRef.current = args.enableThinking;
  }, [args.enableThinking]);

  // 2. transport: 每个 chatId 一个, 闭包持有 chatId 用于 reconnect URL + body.
  // 2. Transport: one per chatId; closure captures chatId for the reconnect URL
  //    and for the request body.
  const transport = useMemo(() => {
    if (!chatId) {
      return null;
    }
    return new AbortableWorkflowChatTransport({
      api: "/api/resume",
      prepareReconnectToStreamRequest: ({ api: _ignored, ...rest }) => ({
        ...rest,
        api: `/api/resume/by-chat/${encodeURIComponent(chatId)}/stream`,
      }),
      // Defensive layer over the SDK's default body builder: when regenerating,
      // ensure `messages` is trimmed *before* the message being replaced and
      // that `messageId` is present so the server can prune the DB row.
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body, headers }) => {
        let outgoingMessages = messages;
        if (trigger === "regenerate-message" && messageId) {
          const cutoff = messages.findIndex((m) => m.id === messageId);
          if (cutoff === -1) {
            // 理论上 SDK 只会对存在于 messages 里的 id 触发 regenerate; 若真的
            // 找不到, 维持原样发送整个数组(避免误删), 但记录到 console 便于排查。
            // The SDK should only regenerate ids that exist in messages. If
            // not found, send the full list as-is (don't lose history) and
            // log so the divergence is visible.
            console.warn("[chat] regenerate-message: cutoff messageId not in messages", {
              chatId,
              messageId,
            });
          } else {
            outgoingMessages = messages.slice(0, cutoff);
          }
        }
        const jd = jobDescriptionRef.current.trim();
        return {
          body: {
            ...body,
            chatId,
            enableThinking: enableThinkingRef.current,
            id,
            messageId,
            messages: outgoingMessages,
            trigger,
            ...(jd && { jobDescription: jd }),
          },
          headers: {
            ...headers,
            "content-type": "application/json",
          },
        };
      },
    });
  }, [chatId]);

  // 3. Chat 实例: 第一次见到该 chatId 时构造, 之后从 manager 复用。
  //    `alreadyExisted` 用于 StrictMode 双挂载场景下的 resume 决策。
  // 3. Chat instance: created on first sight of chatId, reused thereafter.
  //    `alreadyExisted` informs the StrictMode-safe resume decision below.
  const { instance: chatInstance, alreadyExisted } = useMemo(() => {
    if (!chatId || !transport) {
      return { alreadyExisted: false, instance: null };
    }
    return getOrCreateChatInstance(chatId, {
      id: chatId,
      messages: initialMessages ?? [],
      // 工具调用完成或审批响应完成后,自动 submit 续跑下一步。
      // 注意: hook 层的 `sendAutomaticallyWhen` 会被 SDK 在外部 Chat 实例下忽略,
      // 必须落在构造器上。
      // Auto-submit after a tool call's output / approval response lands.
      // The hook-level `sendAutomaticallyWhen` is ignored by the SDK when an
      // external Chat instance is provided, so it must live on the constructor.
      onFinish: ({ message, isAbort, isDisconnect, isError }) => {
        notifyConversationsChanged();
        if (message.role === "assistant" && (isAbort || isDisconnect || isError)) {
          void persistPartialMessage(chatId, message);
        }
      },
      sendAutomaticallyWhen: ({ messages }) =>
        lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
        lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
      transport,
    });
    // 仅按 chatId 创建一次; init 字段（initialMessages / transport）只在创建时使用。
    // Created once per chatId; init values are used at creation time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // 4. Resume 决策: 一次性, 防止 StrictMode 双挂载或后续 status 抖动重复 resumeStream。
  //    第一次 mount: alreadyExisted=false → 按 initialActiveWorkflowRunId 决定。
  //    第二次 mount (StrictMode 或 unmount/remount): alreadyExisted=true,
  //    此时 chatInstance.status 应该已经被第一次 mount 的 resumeStream 带到
  //    `submitted` / `streaming` —— 直接关掉 resume, 避免发出第二个并发 GET。
  // 4. One-shot resume decision. First mount: alreadyExisted=false → resume
  //    if there's a known active runId. Second mount (StrictMode or
  //    unmount/remount): alreadyExisted=true; chat status was flipped to
  //    submitted/streaming by the first mount's resumeStream, so the guard
  //    falls to false and we don't fire a duplicate concurrent GET.
  const shouldResumeOnMountRef = useRef(
    Boolean(initialActiveWorkflowRunId) &&
      (!alreadyExisted || chatInstance?.status === "ready" || chatInstance?.status === "error"),
  );

  // 5. useChat: chatInstance 存在时绑定到它，否则给 throwaway 默认实例(供 /chat 新建路径)。
  // 5. useChat: bind to the instance when present; throwaway init for the
  //    `/chat` new-conversation path so the hook can be called unconditionally.
  const chat = useChat<UIMessage>(
    chatInstance
      ? {
          chat: chatInstance,
          experimental_throttle: CHAT_UI_UPDATE_THROTTLE_MS,
          resume: shouldResumeOnMountRef.current,
        }
      : { experimental_throttle: CHAT_UI_UPDATE_THROTTLE_MS },
  );

  // 6. user-stopped 标志: 防止 stop 之后 probe / auto-recovery 立刻重连。
  // 6. user-stopped flag: prevents probe / auto-recovery from immediately
  //    reconnecting to the still-live server stream after the user clicked
  //    stop (the main cause of the "tap stop 3 times on iOS" bug).
  const userStoppedRef = useRef(false);
  const retryInFlightRef = useRef(false);

  const stopChatStream = useCallback(() => {
    userStoppedRef.current = true;

    // 通知服务端取消 workflow run, 否则即便客户端断开 fetch, 服务端
    // workflow 仍在跑, 刷新页面后 SSR 看到 activeWorkflowRunId 仍有值
    // 会重新接回去。同时尽力把客户端最新的 assistant 快照随请求发上去,
    // 让服务端在 cancel 前先落库, 避免中途 stop 丢失已生成的内容。
    // Notify the server to cancel the workflow run. Without this the
    // server keeps streaming and a refresh would reattach via SSR's
    // activeWorkflowRunId. Also send the client's latest assistant
    // snapshot so the server can persist mid-stream output before
    // cancelling.
    if (chatId) {
      const lastMessage = chat.messages.at(-1);
      const assistantMessage = lastMessage?.role === "assistant" ? lastMessage : undefined;
      void (async () => {
        try {
          const response = await fetch(`/api/resume/by-chat/${encodeURIComponent(chatId)}/stop`, {
            body: JSON.stringify(assistantMessage ? { assistantMessage } : {}),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          });
          if (!response.ok) {
            // 服务端返 4xx/5xx: workflow 可能没被取消, 刷新页面会被 SSR 接回去。
            // 不阻塞 UI, 但要让开发者在 console 里看到。
            // Server returned 4xx/5xx: the workflow may NOT have been
            // cancelled. A refresh would re-attach via SSR's
            // activeWorkflowRunId. Surface in console without blocking UI.
            console.warn("[chat] stop request rejected by server", {
              chatId,
              status: response.status,
            });
          }
        } catch (error) {
          // 网络失败: 同样有 SSR 接回去的风险。
          // Network failure: same re-attach risk on refresh.
          console.warn("[chat] stop request failed", { chatId, error });
        }
      })();
    }

    void chat.stop();
    if (chatId) {
      abortChatInstanceTransport(chatId);
    }
  }, [chat, chatId]);

  const retryChatStream = useCallback(
    (opts?: RetryChatStreamOptions) => {
      const strategy = opts?.strategy ?? (opts?.auto ? "soft" : "hard");

      // 自动恢复 (visibility/online/focus) 路径: 用户主动 stop 过则只清 error
      // 避免后台节流恢复时把用户已经"停了"的会话又拉回来。手动 retry 不走这里。
      // Auto-recovery path: if the user explicitly stopped, just clear the
      // error so the stale banner goes away — don't reconnect.
      if (opts?.auto && userStoppedRef.current) {
        chat.clearError();
        return;
      }

      if (retryInFlightRef.current) {
        return;
      }
      // 手动 retry 一定要清掉 user-stopped 标志, 否则后续的 probe / auto 路径
      // 仍会被这条记忆挡住。Auto 路径走到这里说明 userStopped 已经是 false。
      // Manual retry must clear the userStopped flag; auto path only reaches
      // here when the flag is already false.
      userStoppedRef.current = false;
      retryInFlightRef.current = true;

      void (async () => {
        try {
          if (strategy === "hard") {
            try {
              await chat.stop();
            } catch {
              // chat.stop() 可能因为已经 ready/error 而抛, 忽略后继续重连。
              // chat.stop() may throw when already ready/error — ignore.
            }
            if (chatId) {
              abortChatInstanceTransport(chatId);
            }
          }
          chat.clearError();
          await chat.resumeStream();
        } finally {
          retryInFlightRef.current = false;
        }
      })();
    },
    [chat, chatId],
  );

  // 7. 新一轮 submit 开始时重置 user-stopped, 让自动恢复重新生效。
  // 7. Reset user-stopped when a fresh submit begins so auto-recovery works
  //    normally for the new stream.
  useEffect(() => {
    if (chat.status === "submitted") {
      userStoppedRef.current = false;
    }
  }, [chat.status]);

  // 8. Reactive resume probe.
  //   `useChat({ resume })` 是 mount-only, 取的是 SSR 注入的 initialActiveWorkflowRunId。
  //   竞态: 用户点发送, 服务端还没把 activeWorkflowRunId 持久化前, 用户切走又立刻切回 ——
  //   SSR 看到 null, mount 不会触发 resume。
  //   解决: 如果 mount 时没拿到 runId 但最后一条是未回复的 user message, 按
  //   [0, 1s, 2.5s, 5.5s, 10s] 探测 `/api/resume/by-chat/:chatId/stream`(没运行就返回
  //   204, 探测开销可控)。一旦 resume 接上, status 会切到 streaming 后续探测自行跳过。
  //
  // Race-condition fallback: useChat({ resume }) is mount-only and uses the
  // SSR-injected runId. If the user submits, navigates away before the server
  // persists the runId, and returns quickly, the mount sees null. Probe with
  // backoff [0, 1s, 2.5s, 5.5s, 10s]; the endpoint returns 204 when there's
  // nothing live so cost is bounded. Once resume attaches, status flips to
  // streaming and further attempts self-skip.
  useEffect(() => {
    if (!chatInstance || initialActiveWorkflowRunId) {
      return;
    }
    // 用 effect 内部一次性检查 messages, 不放进 deps —— 否则 chat.resumeStream()
    // 触发的 messages / status 抖动会把这个 boolean 翻来翻去, 让 effect 反复
    // cleanup + 重启 schedule(0), 累计出几十次 GET。
    // Read messages once inside the effect (don't put in deps): otherwise the
    // boolean flips during resumeStream's status churn, repeatedly tearing
    // down and restarting the schedule and producing tens of duplicate GETs.
    if (chatInstance.messages.at(-1)?.role !== "user") {
      return;
    }
    if (userStoppedRef.current) {
      return;
    }

    let cancelled = false;
    const delaysMs = [0, 1000, 2500, 5500, 10_000];
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const attemptResume = async () => {
      if (cancelled || userStoppedRef.current) {
        return;
      }
      const { status } = chatInstance;
      if (status !== "ready" && status !== "error") {
        return;
      }
      try {
        await chat.resumeStream();
      } catch {
        // Transient failure — let the next scheduled attempt retry.
      }
    };

    const schedule = (index: number) => {
      if (cancelled || index >= delaysMs.length) {
        return;
      }
      timeoutId = setTimeout(async () => {
        await attemptResume();
        if (cancelled) {
          return;
        }
        schedule(index + 1);
      }, delaysMs[index]);
    };

    schedule(0);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
    // mount-only probe per (chatId, runId); chatInstance / chat 身份每个 chatId
    // 内稳定 (来自 chat-instance-manager 的 Map)。
    // mount-only probe per (chatId, runId); chat identity stays stable within
    // a chatId thanks to the instance manager.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, initialActiveWorkflowRunId]);

  // 9. 路由 unmount 时清理: abort 本地 transport + 释放 instance, 但不 stop 服务端
  //    workflow —— 让 generation 继续在后台跑, 下次回到此 chat 通过 SSR + resume 接回。
  // 9. Route teardown: abort the local transport and release the instance,
  //    but do NOT stop the server workflow. Generation continues server-side,
  //    next visit re-attaches via SSR + resume.
  useEffect(() => {
    if (!chatId) {
      return;
    }
    return () => {
      cleanupChatRouteOnUnmount(chatId);
    };
  }, [chatId]);

  return {
    chat,
    hasBoundChat: chatInstance !== null,
    retryChatStream,
    stopChatStream,
  };
}
