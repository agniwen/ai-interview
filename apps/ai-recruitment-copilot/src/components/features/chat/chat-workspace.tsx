"use client";

import { useChat } from "@ai-sdk/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { IconRefresh, IconX } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NewRecruitingThread,
  RecruitingCopilotContextProvider,
  RecruitingThread,
  RecruitingToolRenderers,
} from "@/components/assistant-ui/recruiting-thread";
import { Button } from "@/components/ui/button";
import {
  fetchConversation,
  patchConversation,
  requestResumeChatTitle,
  upsertConversation as upsertConversationOnServer,
} from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { runAsyncAction } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@arc/shared/utils";
import { getVisibleConversationTitle, useSetChatHeaderTitle } from "./chat-header";
import { ChatMessageSkeletonContent, ChatPageSkeleton } from "./chat-page-skeleton";
import { CHAT_EVENTS, notifyConversationsChanged } from "./lib/chat-events";
import { setChatMeta } from "./lib/chat-meta";
import { getOrCreateChat, hasChat } from "./lib/chat-registry";

const NEW_CHAT_TITLE = "新对话";
const GENERATING_CHAT_TITLE = "生成中...";
const MAX_CHAT_TITLE_LENGTH = 28;

function getConversationTitleFromText(text: string) {
  const title = text.trim().replaceAll(/\s+/g, " ").slice(0, MAX_CHAT_TITLE_LENGTH);
  return title || NEW_CHAT_TITLE;
}

function ChatErrorBar({
  error,
  historyErrorMessage,
  onClearError,
  onRetry,
}: {
  error: Error | undefined;
  historyErrorMessage: string | null;
  onClearError: () => void;
  onRetry: () => void;
}) {
  if (!error && !historyErrorMessage) {
    return null;
  }
  return (
    <div className="border-t px-4 py-2">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
        <span className="min-w-0 flex-1">
          {historyErrorMessage ?? "请求失败，这一步没有完成。"}
        </span>
        {error ? (
          <>
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              <IconRefresh className="size-3.5" />
              重试
            </Button>
            <Button
              aria-label="关闭错误"
              onClick={onClearError}
              size="icon"
              type="button"
              variant="ghost"
            >
              <IconX className="size-3.5" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ChatWorkspace({ initialSessionId }: { initialSessionId: string | null }) {
  const slug = useWorkspaceSlug();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const setSessionTitle = useSetChatHeaderTitle();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [shouldNormalizeSessionPath, setShouldNormalizeSessionPath] = useState(false);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(null);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);

  const submitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (submitDebounceRef.current !== null) {
        clearTimeout(submitDebounceRef.current);
      }
    },
    [],
  );

  const boundChat = useMemo(
    () => (activeConversationId ? getOrCreateChat(activeConversationId, slug) : null),
    [activeConversationId, slug],
  );

  const chatHelpers = useChat(
    boundChat ? { chat: boundChat, experimental_throttle: 50 } : { experimental_throttle: 50 },
  );
  const runtime = useAISDKRuntime(chatHelpers, { joinStrategy: "none" });
  const { clearError, error, messages, regenerate, setMessages, status } = chatHelpers;
  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!boundChat) {
      setMessages([]);
    }
  }, [boundChat, setMessages]);

  const updateSessionInUrl = useCallback(
    (sessionId: string | null) => {
      if (sessionId === initialSessionId || (!sessionId && initialSessionId === null)) {
        return;
      }
      if (sessionId) {
        void navigate({
          params: { sessionId, slug },
          replace: true,
          to: "/w/$slug/agent/$sessionId",
        });
        return;
      }
      void navigate({
        params: { slug },
        replace: true,
        to: "/w/$slug/agent",
      });
    },
    [initialSessionId, navigate, slug],
  );

  const updateConversationTitle = useCallback(
    async (id: string, title: string) => {
      const normalizedTitle = title.trim().slice(0, MAX_CHAT_TITLE_LENGTH);
      if (!normalizedTitle) {
        return;
      }
      try {
        await patchConversation(slug, id, {
          isTitleGenerating: false,
          title: normalizedTitle,
        });
        setSessionTitle({ sessionId: id, title: normalizedTitle });
        notifyConversationsChanged();
      } catch {
        setHistoryErrorMessage("会话已创建，但标题保存失败。");
      }
    },
    [setSessionTitle, slug],
  );

  const ensureConversation = useCallback(
    async ({ withGeneratingTitle }: { withGeneratingTitle?: boolean } = {}) => {
      if (activeConversationId) {
        return activeConversationId;
      }
      const id = crypto.randomUUID();
      await upsertConversationOnServer(slug, {
        createdAt: Date.now(),
        id,
        isTitleGenerating: withGeneratingTitle ?? false,
        jobDescription: "",
        jobDescriptionConfig: null,
        resumeImports: {},
        title: withGeneratingTitle ? GENERATING_CHAT_TITLE : NEW_CHAT_TITLE,
      });
      setSessionTitle({
        sessionId: id,
        title: withGeneratingTitle ? GENERATING_CHAT_TITLE : NEW_CHAT_TITLE,
      });
      setChatMeta(id, {});
      notifyConversationsChanged();
      updateSessionInUrl(id);
      setActiveConversationId(id);
      return id;
    },
    [activeConversationId, setSessionTitle, slug, updateSessionInUrl],
  );

  const sendFirstMessage = useCallback(
    async (text: string) => {
      if (submitDebounceRef.current !== null) {
        return;
      }
      submitDebounceRef.current = setTimeout(() => {
        submitDebounceRef.current = null;
      }, 300);
      setIsCreatingConversation(true);
      await runAsyncAction({
        cleanup: () => setIsCreatingConversation(false),
        onError: () => setHistoryErrorMessage("聊天记录保存失败，请稍后重试。"),
        operation: async () => {
          const conversationId = await ensureConversation({ withGeneratingTitle: true });
          setHistoryErrorMessage(null);
          await getOrCreateChat(conversationId, slug).sendMessage({ text });
          void (async () => {
            try {
              const payload = await requestResumeChatTitle({ hasFiles: false, text });
              await updateConversationTitle(
                conversationId,
                payload.title?.trim() || getConversationTitleFromText(text),
              );
            } catch {
              await updateConversationTitle(conversationId, getConversationTitleFromText(text));
            }
          })();
        },
      });
    },
    [ensureConversation, slug, updateConversationTitle],
  );

  const openConversation = useCallback(
    async (
      id: string,
      { shouldSyncUrl = true, signal }: { shouldSyncUrl?: boolean; signal?: AbortSignal } = {},
    ) => {
      let conversation: Awaited<ReturnType<typeof fetchConversation>> = null;
      try {
        conversation = await fetchConversation(slug, id);
      } catch {
        if (signal?.aborted) {
          return false;
        }
        setHistoryErrorMessage("无法加载聊天记录，请稍后重试。");
        return false;
      }
      if (signal?.aborted) {
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
      if (!hasChat(id)) {
        getOrCreateChat(id, slug, { initialMessages: conversation.messages });
      }
      setSessionTitle({ sessionId: id, title: getVisibleConversationTitle(conversation) });
      setActiveConversationId(id);
      setHistoryErrorMessage(null);
      return true;
    },
    [setSessionTitle, slug, updateSessionInUrl],
  );

  const resetToNewConversation = useCallback(() => {
    setSessionTitle(null);
    setActiveConversationId(null);
    setHistoryErrorMessage(null);
  }, [setSessionTitle]);

  const startNewConversation = useCallback(() => {
    resetToNewConversation();
    updateSessionInUrl(null);
  }, [resetToNewConversation, updateSessionInUrl]);

  useEffect(() => {
    const controller = new AbortController();
    const bootstrap = async () => {
      await runAsyncAction({
        cleanup: () => {
          if (!controller.signal.aborted) {
            setIsHistoryReady(true);
          }
        },
        onError: () => {
          if (!controller.signal.aborted) {
            setHistoryErrorMessage("加载历史聊天失败，请稍后重试。");
          }
        },
        operation: async () => {
          if (initialSessionId) {
            await openConversation(initialSessionId, {
              shouldSyncUrl: false,
              signal: controller.signal,
            });
            return;
          }
          resetToNewConversation();
        },
      });
    };
    void bootstrap();
    return () => controller.abort();
  }, [initialSessionId, openConversation, resetToNewConversation]);

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

  const retryLastReply = useCallback(() => {
    const lastMessage = messages.at(-1);
    clearError();
    if (lastMessage?.role === "assistant") {
      void regenerate({ messageId: lastMessage.id });
      return;
    }
    void regenerate();
  }, [clearError, messages, regenerate]);

  if (!isHistoryReady && !initialSessionId) {
    return <ChatPageSkeleton />;
  }

  const showConversationThread = Boolean(
    activeConversationId || (initialSessionId && !isHistoryReady),
  );

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col",
        showConversationThread ? undefined : "pt-(--header-height)",
      )}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <RecruitingCopilotContextProvider conversationId={activeConversationId}>
          <RecruitingToolRenderers />
          {showConversationThread ? (
            <RecruitingThread
              historyLoading={!isHistoryReady}
              historyLoadingFallback={<ChatMessageSkeletonContent />}
              isRunning={isStreaming}
            />
          ) : (
            <NewRecruitingThread
              disabled={isCreatingConversation || !session}
              onSubmit={sendFirstMessage}
            />
          )}
        </RecruitingCopilotContextProvider>
        <ChatErrorBar
          error={error}
          historyErrorMessage={historyErrorMessage}
          onClearError={clearError}
          onRetry={retryLastReply}
        />
      </AssistantRuntimeProvider>
    </div>
  );
}
