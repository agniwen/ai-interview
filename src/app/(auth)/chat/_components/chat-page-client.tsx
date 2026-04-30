"use client";

import type { ChatStatus, FileUIPart, UIMessage } from "ai";
import type { ChatConversationDetail } from "@/lib/api/endpoints/chat";
import type { JobDescriptionConfig } from "@/lib/job-description-config";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestResumeChatTitle } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  fetchConversation,
  patchConversation,
  upsertConversation as upsertConversationOnServer,
} from "@/lib/chat-api";
import { thinkingModeAtom } from "../_atoms/thinking";
import { CHAT_EVENTS, notifyConversationsChanged } from "../_lib/chat-events";
import { trailingAssistantHasRenderableContent } from "../_lib/chat-streaming-state";
import { useChatRuntime } from "../_lib/use-chat-runtime";
import { useJobDescriptionConfig } from "../_lib/use-job-description-config";
import { useJobDescriptionOptionsQuery } from "../_lib/use-job-description-options";
import { useResumeImports } from "../_lib/use-resume-imports";
import { useStreamRecovery } from "../_lib/use-stream-recovery";
import { ChatRuntimeProvider } from "./chat-runtime-context";
import type { SendMessageInput } from "./chat-runtime-context";
import { Composer } from "./composer/composer";
import { QuickSuggestions } from "./composer/quick-suggestions";
import { ComposerInputProvider } from "./composer-input-context";
import { ConversationView } from "./conversation-view";
import { ErrorBanner } from "./error-banner";
import { JobDescriptionDialog } from "./job-description-dialog";

const NEW_CHAT_TITLE = "新对话";
const GENERATING_CHAT_TITLE = "生成中...";
const MAX_CHAT_TITLE_LENGTH = 28;

function getConversationTitleFromMessages(
  messages: UIMessage[],
  fallbackTitle: string = NEW_CHAT_TITLE,
) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    return fallbackTitle;
  }
  const text = firstUserMessage.parts
    .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (text.length > 0) {
    return text.slice(0, MAX_CHAT_TITLE_LENGTH);
  }
  if (firstUserMessage.parts.some((p) => p.type === "file")) {
    return "含附件对话";
  }
  return fallbackTitle;
}

// eslint-disable-next-line complexity -- Top-level shell owns many pieces of orchestration state.
export default function ChatPageClient({
  initialSessionId,
  initialConversation,
}: {
  initialSessionId: string | null;
  initialConversation?: ChatConversationDetail | null;
}) {
  const { data: session } = authClient.useSession();
  const thinkingMode = useAtomValue(thinkingModeAtom);

  // SSR 已经把会话快照塞过来了, 用 lazy initializer 直接同步 hydrate, 避免一帧空 UI 闪烁。
  // SSR snapshot is already available — lazy-init from it to avoid a one-frame flash.
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    () => initialConversation?.id ?? null,
  );
  const [isHistoryReady, setIsHistoryReady] = useState(() => Boolean(initialConversation));
  const [shouldNormalizeSessionPath, setShouldNormalizeSessionPath] = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  // Tracks whether we expect a model response right now. Set optimistically in
  // the submit path (before the SDK status transitions) and kept in sync via
  // the effect below so the send/stop button stays stable during the agent
  // loop's brief `ready` gaps between auto-submitted steps.
  const [hasPendingResponse, setHasPendingResponse] = useState(false);
  // Explicit user stop — lets us force the UI back to idle even if the SDK
  // status gets stuck (some abort paths on iOS/Safari leave it on `streaming`).
  const [userStopped, setUserStopped] = useState(false);

  // 服务端注入的初始 JD 配置: 优先用结构化字段, 兼容仅有文本的旧记录。
  // SSR-injected initial JD config: prefer the structured field, fall back to
  // legacy text-only conversations by treating them as custom mode.
  const initialJobDescriptionConfig = useMemo<JobDescriptionConfig | null>(() => {
    if (!initialConversation) {
      return null;
    }
    if (initialConversation.jobDescriptionConfig) {
      return initialConversation.jobDescriptionConfig;
    }
    const legacy = initialConversation.jobDescription.trim();
    return legacy ? { mode: "custom", text: initialConversation.jobDescription } : null;
  }, [initialConversation]);

  // 抽出的状态切片：JD 配置 / 简历导入映射。
  // Extracted state slices: JD config + resume-import mapping.
  const {
    config: jobDescriptionConfig,
    setConfig: setJobDescriptionConfig,
    text: jobDescriptionText,
    label: jobDescriptionLabel,
    hasJobDescription,
    isDialogOpen: isJobDescriptionDialogOpen,
    setIsDialogOpen: setIsJobDescriptionDialogOpen,
    openDialog: openJobDescriptionDialog,
    save: saveJobDescription,
    clear: clearJobDescription,
  } = useJobDescriptionConfig(initialJobDescriptionConfig);
  const {
    map: resumeImports,
    replaceAll: replaceResumeImports,
    reset: resetResumeImports,
    markImported: handleResumeImported,
    markMissing: handleResumeImportMissing,
  } = useResumeImports(initialConversation?.resumeImports ?? {});

  const userName = session?.user?.name ?? "用户";

  // Guards `sendMessageToChat` from re-entry on rapid double-clicks. Released
  // after a short delay — by then the SDK status has moved to submitted and
  // the submit button is disabled.
  const submitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (submitDebounceRef.current !== null) {
        clearTimeout(submitDebounceRef.current);
      }
    },
    [],
  );

  // 单一 hook 拥有 transport / Chat 实例 / resume / probe / cleanup。
  // 关键: chatId 可以是 null —— /chat 新建会话路径下, 在用户首次发送之前 hook 不构造
  // Chat 实例; 一旦 ensureConversation 设置了 activeConversationId, 下一次 render
  // hook 就把 transport + 实例 + 续接探测 / unmount 清理全部串起来。
  // Single hook owns transport + Chat instance + resume policy + probe +
  // cleanup. chatId is allowed to be null — `/chat` new-conversation path
  // runs through the hook with no instance until the user sends the first
  // message, after which the next render fully wires it up.
  const { chat, hasBoundChat, stopChatStream, retryChatStream } = useChatRuntime({
    chatId: activeConversationId,
    enableThinking: thinkingMode,
    initialActiveWorkflowRunId:
      initialConversation && initialConversation.id === activeConversationId
        ? initialConversation.activeWorkflowRunId
        : null,
    initialMessages:
      initialConversation && initialConversation.id === activeConversationId
        ? initialConversation.messages
        : undefined,
    jobDescriptionText,
  });

  const {
    addToolOutput,
    messages,
    setMessages,
    status,
    error,
    regenerate,
    clearError,
    sendMessage,
  } = chat;

  // visibilitychange / online / focus 时尝试自动续接服务端流。
  // 关键: 只在 status === "error" 或 "submitted 但还没助手内容" 时才发请求。
  // 否则空跑会让 /api/resume/by-chat/.../stream 被反复打 204。userStopped 已被
  // useChatRuntime 内部尊重 —— 用户主动停止过的会话不会被自动拉回。
  // Auto-resume on visibility/online/focus, but only when there's reason to
  // believe a stream is broken (error or stalled submitted). Idle ready/
  // streaming states skip the GET to avoid 204 floods.
  // 用 hasRenderableAssistantPart 判断"是不是真的有可见内容", 而不是 parts.length > 0
  // —— 后者会把 step-start 之类的占位 part 也算进去, 让 stall recovery 误判。
  // Use the renderable-part helper so empty placeholders (step-start etc.)
  // don't count as "has assistant content".
  const hasAssistantContent = trailingAssistantHasRenderableContent(messages);
  useStreamRecovery({
    chatId: activeConversationId,
    hasAssistantContent,
    retryChatStream,
    status,
  });

  // Keep the latest messages reachable from callbacks without making
  // `messages` itself a dep — otherwise every streamed chunk would re-create
  // ensureConversation / sendMessageToChat / handleContinueAfterError, which
  // in turn would churn ActionsContext value and re-render the composer.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // 也把 sendMessage 挂到 ref 里:
  // - "首条消息" 由 ensureConversation 设置 activeConversationId 后, 在下一次 render
  //   通过 effect 派发 (此时 hook 才完成 Chat 实例的构造)。effect 直接读 ref 而不是
  //   把 sendMessage 放进 deps —— 这样在普通流式 chunk 期间不会被重建。
  // Mirror sendMessage on a ref. The "first message" path enqueues a
  // pendingFirstMessage and the effect below dispatches via the ref once the
  // hook has wired up the new Chat instance — the effect avoids putting
  // sendMessage in its deps so streaming chunks don't churn it.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  const isChatInFlight = (status === "submitted" || status === "streaming") && !userStopped;
  let effectiveStatus: ChatStatus = status;
  if (userStopped) {
    effectiveStatus = "ready";
  } else if (hasPendingResponse) {
    effectiveStatus = "streaming";
  }
  const isStreaming = effectiveStatus === "submitted" || effectiveStatus === "streaming";
  const latestMessage = messages.at(-1);
  const showAssistantThinkingBubble = isStreaming && latestMessage?.role === "user";

  useEffect(() => {
    if (isChatInFlight) {
      setHasPendingResponse(true);
      return;
    }
    if (status === "ready" || status === "error") {
      setHasPendingResponse(false);
      setUserStopped(false);
    }
  }, [isChatInFlight, status]);

  const handleStop = useCallback(() => {
    stopChatStream();
    setHasPendingResponse(false);
    setUserStopped(true);
  }, [stopChatStream]);

  const updateSessionInUrl = useCallback((sessionId: string | null) => {
    const nextUrl = sessionId ? `/chat/${encodeURIComponent(sessionId)}` : "/chat";
    if (window.location.pathname === nextUrl) {
      return;
    }
    window.history.replaceState(window.history.state, "", nextUrl);
    window.dispatchEvent(
      new CustomEvent(CHAT_EVENTS.sessionPathUpdated, {
        detail: { pathname: nextUrl, sessionId },
      }),
    );
  }, []);

  const updateConversationTitle = useCallback(async (id: string, title: string) => {
    const normalizedTitle = title.trim().slice(0, MAX_CHAT_TITLE_LENGTH);
    if (!normalizedTitle) {
      return;
    }
    try {
      await patchConversation(id, {
        isTitleGenerating: false,
        title: normalizedTitle,
      });
      notifyConversationsChanged();
    } catch {
      // ignore — the derived title fallback on the server remains
    }
  }, []);

  const ensureConversation = useCallback(
    async ({ withGeneratingTitle }: { withGeneratingTitle?: boolean } = {}) => {
      if (activeConversationId) {
        return activeConversationId;
      }
      const id = crypto.randomUUID();
      const now = Date.now();
      const derivedTitle = withGeneratingTitle
        ? GENERATING_CHAT_TITLE
        : getConversationTitleFromMessages(messagesRef.current);

      await upsertConversationOnServer({
        createdAt: now,
        id,
        isTitleGenerating: withGeneratingTitle ?? false,
        jobDescription: jobDescriptionText,
        jobDescriptionConfig,
        resumeImports,
        title: derivedTitle,
      });
      notifyConversationsChanged();
      updateSessionInUrl(id);
      setActiveConversationId(id);
      return id;
    },
    [
      activeConversationId,
      jobDescriptionConfig,
      jobDescriptionText,
      resumeImports,
      updateSessionInUrl,
    ],
  );

  // 首条消息发送的延迟队列: ensureConversation 之后状态还没 commit, hook 还没把
  // Chat 实例构造好, 因此把 (files, text) 暂存; 下一次 render hook 完成后由
  // useEffect 派发到真正的 Chat 实例上。
  // Pending first message queue: ensureConversation flips activeConversationId
  // but the next render hasn't happened yet, so the hook's Chat instance
  // doesn't exist. Park (files, text) here and let the effect dispatch once
  // hasBoundChat flips true.
  const [pendingFirstMessage, setPendingFirstMessage] = useState<SendMessageInput | null>(null);

  useEffect(() => {
    if (!pendingFirstMessage || !hasBoundChat) {
      return;
    }
    const { files, text } = pendingFirstMessage;
    setPendingFirstMessage(null);
    void sendMessageRef.current({ files: files as FileUIPart[], text });
  }, [pendingFirstMessage, hasBoundChat]);

  const sendMessageToChat = useCallback(
    async ({ files, text }: SendMessageInput) => {
      if (submitDebounceRef.current !== null) {
        return;
      }
      submitDebounceRef.current = setTimeout(() => {
        submitDebounceRef.current = null;
      }, 300);

      const isFirstMessageForNewConversation =
        !activeConversationId && messagesRef.current.length === 0;

      // Optimistically flip UI into the "responding" state before the SDK
      // status flips — masks the `ready → submitted` flicker.
      setHasPendingResponse(true);
      setUserStopped(false);

      if (isFirstMessageForNewConversation) {
        try {
          const conversationId = await ensureConversation({ withGeneratingTitle: true });
          setHistoryErrorMessage(null);

          const firstMessageText = text.trim();
          if (firstMessageText.length > 0) {
            void (async () => {
              try {
                const payload = await requestResumeChatTitle({
                  hasFiles: Boolean(files?.length),
                  text: firstMessageText,
                });
                const title = payload.title?.trim() ?? null;
                await updateConversationTitle(conversationId, title || NEW_CHAT_TITLE);
              } catch {
                await updateConversationTitle(conversationId, NEW_CHAT_TITLE);
                setHistoryErrorMessage("会话已创建，但智能标题生成失败。已使用默认标题。");
              }
            })();
          }
        } catch {
          setHistoryErrorMessage("聊天记录保存失败，请稍后重试。");
          setHasPendingResponse(false);
          return;
        }

        // Dispatch deferred to the next render where the hook has wired up
        // the new Chat instance — see the pendingFirstMessage effect above.
        setPendingFirstMessage({ files, text });
        return;
      }

      // Existing conversation: hook's `sendMessage` already targets the right
      // Chat instance.
      await sendMessageRef.current({ files: files as FileUIPart[], text });
    },
    [activeConversationId, ensureConversation, updateConversationTitle],
  );

  const openConversation = useCallback(
    async (id: string, { shouldSyncUrl = true }: { shouldSyncUrl?: boolean } = {}) => {
      let conversation: Awaited<ReturnType<typeof fetchConversation>> = null;
      try {
        conversation = await fetchConversation(id);
      } catch {
        setHistoryErrorMessage("无法加载聊天记录，请稍后重试。");
        return false;
      }

      if (!conversation) {
        if (shouldSyncUrl) {
          updateSessionInUrl(null);
        } else {
          setShouldNormalizeSessionPath(true);
        }
        setHistoryErrorMessage("未找到对应的会话记录，已回到新对话。");
        return false;
      }

      if (shouldSyncUrl) {
        updateSessionInUrl(id);
      }
      setActiveConversationId(id);
      setHistoryErrorMessage(null);
      // Prefer structured config; fall back to legacy text-only conversations
      // by treating them as custom mode.
      const legacyText = conversation.jobDescription.trim();
      let hydratedConfig: JobDescriptionConfig | null = null;
      if (conversation.jobDescriptionConfig) {
        hydratedConfig = conversation.jobDescriptionConfig;
      } else if (legacyText) {
        hydratedConfig = { mode: "custom", text: conversation.jobDescription };
      }
      setJobDescriptionConfig(hydratedConfig);
      replaceResumeImports(conversation.resumeImports ?? {});
      setUploadErrorMessage(null);
      setIsJobDescriptionDialogOpen(false);
      return true;
    },
    [
      replaceResumeImports,
      setJobDescriptionConfig,
      setIsJobDescriptionDialogOpen,
      updateSessionInUrl,
    ],
  );

  const resetToNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setJobDescriptionConfig(null);
    resetResumeImports();
    setUploadErrorMessage(null);
    setHistoryErrorMessage(null);
    setIsJobDescriptionDialogOpen(false);
  }, [resetResumeImports, setJobDescriptionConfig, setIsJobDescriptionDialogOpen]);

  const startNewConversation = useCallback(() => {
    resetToNewConversation();
    updateSessionInUrl(null);
  }, [resetToNewConversation, updateSessionInUrl]);

  useEffect(() => {
    // SSR 路径: 服务端已经把 conversation 塞过来,所有相关状态在 lazy init 阶段已经
    // 同步赋值,这里直接跳过网络请求,避免双重 fetch + 一帧 loading 闪烁。
    // SSR fast path: when the page handed us `initialConversation`, every
    // related state slice was lazy-initialized synchronously, so skip the
    // network round-trip and avoid the one-frame loading flash.
    if (initialConversation) {
      return;
    }
    const bootstrap = async () => {
      try {
        if (initialSessionId) {
          await openConversation(initialSessionId, { shouldSyncUrl: false });
          return;
        }
        resetToNewConversation();
      } catch {
        setHistoryErrorMessage("加载历史聊天失败，请稍后重试。");
      } finally {
        setIsHistoryReady(true);
      }
    };
    void bootstrap();
  }, [initialConversation, initialSessionId, openConversation, resetToNewConversation]);

  useEffect(() => {
    const handleStartNewConversation = () => startNewConversation();
    window.addEventListener(CHAT_EVENTS.startNewConversation, handleStartNewConversation);
    return () => {
      window.removeEventListener(CHAT_EVENTS.startNewConversation, handleStartNewConversation);
    };
  }, [startNewConversation]);

  useEffect(() => {
    if (!shouldNormalizeSessionPath || activeConversationId) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (!activeConversationId) {
        updateSessionInUrl(null);
      }
      setShouldNormalizeSessionPath(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeConversationId, shouldNormalizeSessionPath, updateSessionInUrl]);

  // Persist JD / resumeImports changes (user actions, not message stream).
  // The message stream is persisted server-side via the workflow's
  // persistAssistantMessageStep; this is just the side metadata.
  useEffect(() => {
    if (!isHistoryReady || !activeConversationId) {
      return;
    }
    const saveTimer = window.setTimeout(() => {
      void (async () => {
        try {
          await patchConversation(activeConversationId, {
            jobDescription: jobDescriptionText,
            jobDescriptionConfig,
            resumeImports,
          });
        } catch {
          setHistoryErrorMessage("岗位描述或简历导入保存失败，请稍后重试。");
        }
      })();
    }, 400);
    return () => window.clearTimeout(saveTimer);
  }, [
    activeConversationId,
    isHistoryReady,
    jobDescriptionConfig,
    jobDescriptionText,
    resumeImports,
  ]);

  const { refetch: refetchJobDescriptionOptions } = useJobDescriptionOptionsQuery();

  const handleApplyJDConfirm = useCallback(
    async (toolCallId: string, jobDescriptionId: string) => {
      if (!toolCallId) {
        return;
      }
      const result = await refetchJobDescriptionOptions();
      const record = result.data?.find((item) => item.id === jobDescriptionId) ?? null;
      if (!record) {
        setHistoryErrorMessage("未找到该在招岗位，可能已被删除，请重新选择。");
        await addToolOutput({
          output: { action: "ignore" as const },
          tool: "apply_job_description",
          toolCallId,
        });
        return;
      }
      setJobDescriptionConfig({
        departmentName: record.departmentName,
        jobDescriptionId: record.id,
        mode: "select",
        name: record.name,
        prompt: record.prompt,
      });
      await addToolOutput({
        output: { action: "confirm" as const, jobDescriptionId },
        tool: "apply_job_description",
        toolCallId,
      });
    },
    [addToolOutput, refetchJobDescriptionOptions, setJobDescriptionConfig],
  );

  const handleApplyJDIgnore = useCallback(
    async (toolCallId: string) => {
      if (!toolCallId) {
        return;
      }
      await addToolOutput({
        output: { action: "ignore" as const },
        tool: "apply_job_description",
        toolCallId,
      });
    },
    [addToolOutput],
  );

  const regenerateLastReply = useCallback(
    (messageId: string) => {
      // Pass the explicit `messageId` so the server route can prune the old
      // assistant row from the DB. Without it, the SDK still strips the
      // assistant from local state but omits `messageId` from the request
      // body, leaving the old row orphaned and resurfacing on reload.
      void regenerate({ messageId });
    },
    [regenerate],
  );

  // When the agent loop errors mid-way, drop the failed step's half-written
  // parts while keeping every previously completed step, then re-run.
  // `clearError` alone only flips status to `ready` — it does not trigger
  // `sendAutomaticallyWhen`, so we must call `regenerate` explicitly.
  const handleContinueAfterError = useCallback(() => {
    const lastMessage = messagesRef.current.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") {
      clearError();
      void regenerate();
      return;
    }

    let lastStepStartIndex = -1;
    for (let i = lastMessage.parts.length - 1; i >= 0; i -= 1) {
      if (lastMessage.parts[i]?.type === "step-start") {
        lastStepStartIndex = i;
        break;
      }
    }

    // The first step itself failed (no earlier step-start to keep) — fall back
    // to `regenerate`, which discards the half-written message and starts over.
    // Pass the messageId so the server can prune the partially persisted row
    // (the hook's onFinish writes a partial on isError) before inserting the
    // fresh response — otherwise the orphan resurfaces on reload.
    if (lastStepStartIndex <= 0) {
      clearError();
      void regenerate({ messageId: lastMessage.id });
      return;
    }

    const trimmedParts = lastMessage.parts.slice(0, lastStepStartIndex);
    setMessages((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const next = [...prev];
      const lastIndex = next.length - 1;
      const lastEntry = next[lastIndex];
      if (!lastEntry) {
        return prev;
      }
      next[lastIndex] = { ...lastEntry, parts: trimmedParts };
      return next;
    });
    clearError();
    // Same DB-cleanup reason as above — the partially persisted assistant row
    // must be removed even though we drop it locally via `setMessages`.
    void regenerate({ messageId: lastMessage.id });
  }, [clearError, regenerate, setMessages]);

  return (
    <div className="relative flex h-full w-full flex-col pb-2 pt-4 sm:pb-4 sm:pt-4">
      <ChatRuntimeProvider
        addToolOutput={addToolOutput}
        clearError={clearError}
        effectiveStatus={effectiveStatus}
        error={error}
        isStreaming={isStreaming}
        messages={messages}
        regenerate={regenerate}
        sendMessage={sendMessageToChat}
        setMessages={setMessages}
        showAssistantThinkingBubble={Boolean(showAssistantThinkingBubble)}
        stop={handleStop}
      >
        <ComposerInputProvider>
          <QuickSuggestions />

          <ConversationView
            onApplyJDConfirm={handleApplyJDConfirm}
            onApplyJDIgnore={handleApplyJDIgnore}
            onRegenerate={regenerateLastReply}
            onResumeImported={handleResumeImported}
            onResumeImportMissing={handleResumeImportMissing}
            resumeImports={resumeImports}
            userName={userName}
          />

          <ErrorBanner
            historyErrorMessage={historyErrorMessage}
            onContinueAfterError={handleContinueAfterError}
            uploadErrorMessage={uploadErrorMessage}
          />

          <Composer
            hasJobDescription={hasJobDescription}
            jobDescriptionLabel={jobDescriptionLabel}
            onClearJobDescription={clearJobDescription}
            onOpenJobDescriptionSettings={openJobDescriptionDialog}
            onUploadErrorChange={setUploadErrorMessage}
            uploadErrorMessage={uploadErrorMessage}
          />
        </ComposerInputProvider>
      </ChatRuntimeProvider>

      <JobDescriptionDialog
        config={jobDescriptionConfig}
        onClear={clearJobDescription}
        onOpenChange={setIsJobDescriptionDialogOpen}
        onSave={saveJobDescription}
        open={isJobDescriptionDialogOpen}
      />
    </div>
  );
}
