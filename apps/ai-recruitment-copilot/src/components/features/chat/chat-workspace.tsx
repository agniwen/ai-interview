"use client";

import { useChat } from "@ai-sdk/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { IconRefresh, IconX } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NewRecruitingThread,
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
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
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
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-md border border-destructive/25 bg-destructive/6 px-3 py-2 text-destructive text-sm">
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

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const updateSessionInUrl = useCallback(
    (sessionId: string | null) => {
      if (sessionId === initialSessionId || (!sessionId && initialSessionId === null)) {
        return;
      }
      if (sessionId) {
        void navigate({
          params: { sessionId, slug },
          replace: true,
          to: "/w/$slug/chat/$sessionId",
        });
        return;
      }
      void navigate({
        params: { slug },
        replace: true,
        to: "/w/$slug/chat",
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
        notifyConversationsChanged();
      } catch {
        setHistoryErrorMessage("会话已创建，但标题保存失败。");
      }
    },
    [slug],
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
      setChatMeta(id, { enableThinking: false, jobDescription: "", model: "" });
      notifyConversationsChanged();
      updateSessionInUrl(id);
      setActiveConversationId(id);
      return id;
    },
    [activeConversationId, slug, updateSessionInUrl],
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
      try {
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
      } catch {
        setHistoryErrorMessage("聊天记录保存失败，请稍后重试。");
      } finally {
        setIsCreatingConversation(false);
      }
    },
    [ensureConversation, slug, updateConversationTitle],
  );

  const openConversation = useCallback(
    async (id: string, { shouldSyncUrl = true }: { shouldSyncUrl?: boolean } = {}) => {
      let conversation: Awaited<ReturnType<typeof fetchConversation>> = null;
      try {
        conversation = await fetchConversation(slug, id);
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
      if (!hasChat(id)) {
        getOrCreateChat(id, slug, { initialMessages: conversation.messages });
      }
      setActiveConversationId(id);
      setHistoryErrorMessage(null);
      return true;
    },
    [slug, updateSessionInUrl],
  );

  const resetToNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setHistoryErrorMessage(null);
  }, []);

  const startNewConversation = useCallback(() => {
    resetToNewConversation();
    updateSessionInUrl(null);
  }, [resetToNewConversation, updateSessionInUrl]);

  useEffect(() => {
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
    const lastMessage = messagesRef.current.at(-1);
    clearError();
    if (lastMessage?.role === "assistant") {
      void regenerate({ messageId: lastMessage.id });
      return;
    }
    void regenerate();
  }, [clearError, regenerate]);

  if (!isHistoryReady) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <AssistantRuntimeProvider runtime={runtime}>
        <RecruitingToolRenderers />
        {activeConversationId ? (
          <RecruitingThread isRunning={isStreaming} />
        ) : (
          <NewRecruitingThread
            disabled={isCreatingConversation || !session}
            onSubmit={sendFirstMessage}
          />
        )}
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
