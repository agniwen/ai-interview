"use client";

import { useChat } from "@ai-sdk/react";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  makeAssistantToolUI,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { IconArrowDown, IconRefresh, IconSend2, IconSparkles, IconX } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchConversation,
  patchConversation,
  requestResumeChatTitle,
  upsertConversation as upsertConversationOnServer,
} from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { cn } from "@/lib/utils";
import { CHAT_EVENTS, notifyConversationsChanged } from "./lib/chat-events";
import { setChatMeta } from "./lib/chat-meta";
import { getOrCreateChat, hasChat } from "./lib/chat-registry";

const NEW_CHAT_TITLE = "新对话";
const GENERATING_CHAT_TITLE = "生成中...";
const MAX_CHAT_TITLE_LENGTH = 28;

interface CandidateSummaryCard {
  candidateName: string;
  id: string;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  keySkills: string[];
  notes: string | null;
  pipelineStage: string;
  resumeSummary: string | null;
  targetRole: string | null;
  updatedAt: string;
  workYears: number | null;
}

interface SearchResumeRecordsResult {
  candidateSummaryCards?: CandidateSummaryCard[];
  total?: number;
}

interface RecruitingActionProposal {
  explanation: string;
  id: string;
  payload: Record<string, unknown>;
  title: string;
  type: "bind_candidate_to_job" | "advance_candidate_stage" | "generate_interview_questions";
}

interface RecruitingActionProposalResult {
  proposal?: RecruitingActionProposal;
}

const RecruitingResumeSearchToolUI = makeAssistantToolUI<unknown, SearchResumeRecordsResult>({
  display: "standalone",
  render: ({ result, status }) => {
    const cards = result?.candidateSummaryCards ?? [];
    if (status.type === "running") {
      return (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
          正在检索候选人...
        </div>
      );
    }
    if (cards.length === 0) {
      return (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
          未找到匹配候选人。
        </div>
      );
    }
    return (
      <div className="grid gap-2">
        {cards.map((card) => (
          <article className="rounded-md border bg-background p-3 shadow-sm" key={card.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-medium text-sm">{card.candidateName}</h3>
                <p className="text-muted-foreground text-xs">
                  {card.targetRole ?? "未标注目标岗位"}
                  {card.jobDescriptionName ? ` · ${card.jobDescriptionName}` : ""}
                </p>
              </div>
              <span className="rounded-sm border bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                {card.pipelineStage}
              </span>
            </div>
            {card.resumeSummary ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6">{card.resumeSummary}</p>
            ) : null}
            {card.keySkills.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {card.keySkills.map((skill) => (
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs" key={skill}>
                    {skill}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {typeof result?.total === "number" && result.total > cards.length ? (
          <p className="text-muted-foreground text-xs">
            还有 {result.total - cards.length} 个候选人未展示。
          </p>
        ) : null}
      </div>
    );
  },
  toolName: "search_resume_records",
});

const RecruitingActionProposalToolUI = makeAssistantToolUI<unknown, RecruitingActionProposalResult>(
  {
    display: "standalone",
    render: ({ result, status }) => {
      const proposal = result?.proposal;
      if (status.type === "running") {
        return (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
            正在生成动作建议...
          </div>
        );
      }
      if (!proposal) {
        return null;
      }
      return (
        <article className="rounded-md border bg-background p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">待确认动作</p>
              <h3 className="mt-1 font-medium text-sm">{proposal.title}</h3>
            </div>
            <span className="rounded-sm border bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
              {proposal.type}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6">{proposal.explanation}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button disabled size="sm" type="button" variant="outline">
              忽略
            </Button>
            <Button disabled size="sm" type="button">
              确认
            </Button>
          </div>
        </article>
      );
    },
    toolName: "propose_recruiting_action",
  },
);

function getConversationTitleFromText(text: string) {
  const title = text.trim().replaceAll(/\s+/g, " ").slice(0, MAX_CHAT_TITLE_LENGTH);
  return title || NEW_CHAT_TITLE;
}

function RecruitingToolRenderers() {
  return (
    <>
      <RecruitingResumeSearchToolUI />
      <RecruitingActionProposalToolUI />
    </>
  );
}

function CopilotMessage() {
  const role = useMessage((message) => message.role);
  if (role === "system") {
    return null;
  }
  const isUser = role === "user";
  return (
    <MessagePrimitive.Root className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(760px,88%)] rounded-md px-3 py-2 text-sm leading-6",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted/55 text-foreground",
        )}
      >
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantThread({ isStreaming }: { isStreaming: boolean }) {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport
        autoScroll
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        scrollToBottomOnRunStart
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <ThreadPrimitive.Messages>{() => <CopilotMessage />}</ThreadPrimitive.Messages>
          {isStreaming ? (
            <div className="w-fit rounded-md bg-muted/55 px-3 py-2 text-muted-foreground text-sm">
              思考中...
            </div>
          ) : null}
        </div>
      </ThreadPrimitive.Viewport>
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto flex w-full max-w-5xl items-end gap-2 rounded-md border bg-background p-2 shadow-sm">
          <ComposerPrimitive.Root className="flex min-w-0 flex-1 items-end gap-2">
            <ComposerPrimitive.Input
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="输入招聘问题..."
              submitMode="enter"
            />
            <ComposerPrimitive.Send asChild>
              <Button aria-label="发送" className="size-9 shrink-0" size="icon" type="submit">
                <IconSend2 className="size-4" />
              </Button>
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </div>
      </div>
      <ThreadPrimitive.ScrollToBottom asChild>
        <Button
          aria-label="回到底部"
          className="absolute right-6 bottom-24 size-8"
          size="icon"
          variant="outline"
        >
          <IconArrowDown className="size-4" />
        </Button>
      </ThreadPrimitive.ScrollToBottom>
    </ThreadPrimitive.Root>
  );
}

function EmptyCopilotComposer({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const canSubmit = text.trim().length > 0 && !disabled;

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    const nextText = text.trim();
    setText("");
    await onSubmit(nextText);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
            <IconSparkles className="size-4" />
            <span>Workspace 招聘 Copilot</span>
          </div>
          <div className="rounded-md border bg-background p-2 shadow-sm">
            <Textarea
              className="min-h-24 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="输入招聘问题..."
              value={text}
            />
            <div className="flex justify-end">
              <Button disabled={!canSubmit} onClick={handleSubmit} size="sm" type="button">
                <IconSend2 className="size-4" />
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const { clearError, error, messages, regenerate, setMessages, status, stop } = chatHelpers;
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
          <AssistantThread isStreaming={isStreaming} />
        ) : (
          <EmptyCopilotComposer
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
        {isStreaming ? (
          <Button
            aria-label="停止"
            className="absolute right-6 bottom-24 size-8"
            onClick={stop}
            size="icon"
            type="button"
            variant="outline"
          >
            <IconX className="size-4" />
          </Button>
        ) : null}
      </AssistantRuntimeProvider>
    </div>
  );
}
