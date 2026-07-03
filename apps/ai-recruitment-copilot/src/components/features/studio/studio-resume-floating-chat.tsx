"use client";

import {
  IconLayoutSidebarLeftCollapse,
  IconMessage2,
  IconSend,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  upsertConversation as upsertConversationOnServer,
} from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@arc/shared/utils";
import { CHAT_EVENTS, notifyConversationsChanged } from "../chat/lib/chat-events";
import { setChatMeta } from "../chat/lib/chat-meta";
import { getOrCreateChat, removeChat } from "../chat/lib/chat-registry";
import {
  buildStudioResumeChatId,
  isStudioResumeChatId,
  STUDIO_RESUME_CHAT_EVENT,
} from "./studio-resume-chat";
import type { StudioResumeChatLaunchDetail } from "./studio-resume-chat";

interface ResumeChatSession {
  recordId: string;
  candidateName: string | null;
  title: string;
}

const DEFAULT_TITLE = "简历聊天";

function titleForCandidate(candidateName: string | null): string {
  const name = candidateName?.trim();
  return name ? `简历聊天 · ${name}` : DEFAULT_TITLE;
}

function displaySessionTitle(session: ResumeChatSession | null): string {
  if (!session) {
    return DEFAULT_TITLE;
  }
  return session.candidateName?.trim() || session.title;
}

function extractText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text",
    )
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

function messageRecordId(conversationId: string): string | null {
  const match = conversationId.match(/^studio-resume:(.+):user:.+$/);
  return match?.[1] ?? null;
}

function CompactMessage({ isStreaming, message }: { isStreaming: boolean; message: UIMessage }) {
  const text = extractText(message);
  if (!text) {
    return null;
  }

  return (
    <Message from={message.role}>
      <MessageContent className={message.role === "assistant" ? "text-sm" : undefined}>
        {message.role === "assistant" ? (
          <MessageResponse isStreaming={isStreaming}>{text}</MessageResponse>
        ) : (
          <p className="whitespace-pre-wrap">{text}</p>
        )}
      </MessageContent>
    </Message>
  );
}

function EmptyPanel({ hasSessions }: { hasSessions: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border bg-muted/30 text-muted-foreground">
        <IconMessage2 className="size-5" />
      </div>
      <p className="font-medium text-sm">{hasSessions ? "开始询问这份简历" : "暂无简历聊天"}</p>
    </div>
  );
}

function NoSessionPanel({ hasSessions }: { hasSessions: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
      <div className="flex max-w-sm flex-col gap-2">
        <p className="font-medium text-sm">从简历库记录发起 AI Chat</p>
        <p className="text-muted-foreground text-sm">
          {hasSessions
            ? "选择左侧已有聊天继续，或在简历库记录的更多菜单中发起新的 AI Chat。"
            : "当前还没有简历聊天。请在简历库记录的更多菜单中发起 AI Chat。"}
        </p>
      </div>
    </div>
  );
}

// eslint-disable-next-line complexity -- floating widget coordinates session list, popover, chat runtime, and first-send creation in one shell.
export function StudioResumeFloatingChat() {
  const slug = useWorkspaceSlug();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [sessions, setSessions] = useState<ResumeChatSession[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [deleteConfirmRecordId, setDeleteConfirmRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hydratedConversationRef = useRef<string | null>(null);

  const activeSession = sessions.find((item) => item.recordId === activeRecordId) ?? null;
  const activeConversationId =
    activeSession && userId
      ? buildStudioResumeChatId({ recordId: activeSession.recordId, userId })
      : null;

  const boundChat = useMemo(
    () => (activeConversationId ? getOrCreateChat(activeConversationId, slug) : null),
    [activeConversationId, slug],
  );

  const { clearError, error, messages, setMessages, status, stop } = useChat(
    boundChat ? { chat: boundChat, experimental_throttle: 50 } : { experimental_throttle: 50 },
  );

  const isStreaming = status === "submitted" || status === "streaming";

  const upsertLocalSession = useCallback((detail: StudioResumeChatLaunchDetail) => {
    const nextSession = {
      candidateName: detail.candidateName,
      recordId: detail.recordId,
      title: titleForCandidate(detail.candidateName),
    };
    setSessions((prev) => {
      const exists = prev.some((item) => item.recordId === detail.recordId);
      if (exists) {
        return prev.map((item) => (item.recordId === detail.recordId ? nextSession : item));
      }
      return [nextSession, ...prev];
    });
    setActiveRecordId(detail.recordId);
    setSessionListOpen(false);
    setOpen(true);
    setLoadError(null);
  }, []);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const { detail } = event as CustomEvent<StudioResumeChatLaunchDetail>;
      if (!detail?.recordId) {
        return;
      }
      upsertLocalSession(detail);
    };

    window.addEventListener(STUDIO_RESUME_CHAT_EVENT, handleOpen);
    return () => window.removeEventListener(STUDIO_RESUME_CHAT_EVENT, handleOpen);
  }, [upsertLocalSession]);

  const refreshExistingSessions = useCallback(async () => {
    if (!userId) {
      return;
    }
    try {
      const rows = await fetchConversations(slug);
      const resumeSessions = rows
        .filter((row) => isStudioResumeChatId(row.id))
        .map((row): ResumeChatSession | null => {
          const recordId = messageRecordId(row.id);
          if (!recordId) {
            return null;
          }
          return {
            candidateName: row.title.replace(/^简历聊天 ·\s*/, "") || null,
            recordId,
            title: row.title || DEFAULT_TITLE,
          };
        })
        .filter((item): item is ResumeChatSession => item !== null);
      setSessions((prev) => {
        const byRecord = new Map<string, ResumeChatSession>();
        for (const item of resumeSessions) {
          byRecord.set(item.recordId, item);
        }
        for (const item of prev) {
          byRecord.set(item.recordId, byRecord.get(item.recordId) ?? item);
        }
        return [...byRecord.values()];
      });
    } catch {
      // keep local pending sessions; next event or interval can refresh
    }
  }, [slug, userId]);

  useEffect(() => {
    void refreshExistingSessions();
    const handleListChanged = () => void refreshExistingSessions();
    window.addEventListener(CHAT_EVENTS.conversationsChanged, handleListChanged);
    return () => window.removeEventListener(CHAT_EVENTS.conversationsChanged, handleListChanged);
  }, [refreshExistingSessions]);

  useEffect(() => {
    if (!activeConversationId || hydratedConversationRef.current === activeConversationId) {
      return;
    }
    hydratedConversationRef.current = activeConversationId;
    void (async () => {
      try {
        const conversation = await fetchConversation(slug, activeConversationId);
        if (conversation) {
          setMessages(conversation.messages);
        } else {
          setMessages([]);
        }
        setLoadError(null);
      } catch {
        setLoadError("聊天记录加载失败。");
      }
    })();
  }, [activeConversationId, setMessages, slug]);

  useEffect(() => {
    if (!activeConversationId || !activeSession) {
      return;
    }
    setChatMeta(activeConversationId, {
      enableThinking: false,
      jobDescription: "",
      model: "",
      studioResumeId: activeSession.recordId,
    });
  }, [activeConversationId, activeSession]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeConversationId || !activeSession || isSending || isStreaming) {
      return;
    }
    setIsSending(true);
    try {
      await upsertConversationOnServer(slug, {
        id: activeConversationId,
        jobDescription: "",
        jobDescriptionConfig: null,
        resumeImports: {},
        title: activeSession.title,
      });
      notifyConversationsChanged();
      setChatMeta(activeConversationId, {
        enableThinking: false,
        jobDescription: "",
        model: "",
        studioResumeId: activeSession.recordId,
      });
      setInput("");
      await getOrCreateChat(activeConversationId, slug).sendMessage({ text });
    } finally {
      setIsSending(false);
    }
  }, [activeConversationId, activeSession, input, isSending, isStreaming, slug]);

  const handleDeleteSession = useCallback(
    async (target: ResumeChatSession) => {
      if (deletingRecordId) {
        return;
      }

      const conversationId = userId
        ? buildStudioResumeChatId({ recordId: target.recordId, userId })
        : null;
      const isDeletingActiveSession = target.recordId === activeRecordId;
      const nextActiveRecordId =
        sessions.find((item) => item.recordId !== target.recordId)?.recordId ?? null;

      setDeletingRecordId(target.recordId);
      try {
        if (isDeletingActiveSession && isStreaming) {
          stop();
        }
        if (conversationId) {
          await deleteConversation(slug, conversationId);
          removeChat(conversationId);
        }

        setSessions((prev) => prev.filter((item) => item.recordId !== target.recordId));
        setDeleteConfirmRecordId(null);
        notifyConversationsChanged();

        if (isDeletingActiveSession) {
          hydratedConversationRef.current = null;
          setMessages([]);
          setActiveRecordId(nextActiveRecordId);
        }
        setLoadError(null);
      } catch {
        setLoadError("聊天记录删除失败。");
      } finally {
        setDeletingRecordId(null);
      }
    },
    [activeRecordId, deletingRecordId, isStreaming, sessions, setMessages, slug, stop, userId],
  );

  const visibleMessages = messages.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  const shouldShowSessionList = sessionListOpen || !activeSession;
  const canSend = Boolean(input.trim()) && Boolean(activeSession) && !isSending && !isStreaming;

  return (
    <>
      {open ? null : (
        <div className="fixed right-4 bottom-4 z-50 size-10">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="打开简历聊天"
                  className="size-full rounded-xl border-primary/20 bg-primary/10 backdrop-blur  shadow text-primary hover:bg-primary/25 "
                  onClick={() => {
                    setSessionListOpen(!activeSession);
                    setOpen(true);
                  }}
                  size="icon"
                  type="button"
                >
                  <IconSparkles className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="left">简历聊天</TooltipContent>
          </Tooltip>
        </div>
      )}

      {open ? (
        <aside
          aria-label="简历聊天"
          className="fixed right-4 bottom-4 z-50 flex h-[min(620px,calc(100dvh-2rem))] w-[min(680px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
        >
          {shouldShowSessionList ? (
            <aside className="flex w-48 shrink-0 flex-col border-border/60 border-r bg-muted/20">
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <div className="flex flex-col gap-1">
                  {sessions.map((item) => (
                    <div
                      className={cn(
                        "group/session flex min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-muted",
                        item.recordId === activeRecordId && "bg-muted",
                      )}
                      key={item.recordId}
                    >
                      <button
                        className={cn(
                          "min-w-0 flex-1 px-2 py-2 text-left text-sm",
                          item.recordId === activeRecordId && "font-medium",
                        )}
                        onClick={() => setActiveRecordId(item.recordId)}
                        title={item.title}
                        type="button"
                      >
                        <span className="block truncate">{displaySessionTitle(item)}</span>
                      </button>
                      <Popover
                        onOpenChange={(value) =>
                          setDeleteConfirmRecordId(value ? item.recordId : null)
                        }
                        open={deleteConfirmRecordId === item.recordId}
                      >
                        <PopoverTrigger
                          render={
                            <Button
                              aria-label={`删除 ${displaySessionTitle(item)}`}
                              className={cn(
                                "mr-1 size-7 shrink-0 opacity-0 transition-opacity group-hover/session:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100",
                                item.recordId === activeRecordId && "opacity-100",
                              )}
                              disabled={deletingRecordId === item.recordId}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <IconTrash className="size-3.5" />
                            </Button>
                          }
                        />
                        <PopoverContent align="end" className="w-52 p-3" sideOffset={6}>
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1">
                              <p className="font-medium text-sm">删除这条聊天？</p>
                              <p className="text-muted-foreground text-xs">删除后无法恢复。</p>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                disabled={deletingRecordId === item.recordId}
                                onClick={() => setDeleteConfirmRecordId(null)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                取消
                              </Button>
                              <Button
                                disabled={deletingRecordId === item.recordId}
                                onClick={() => void handleDeleteSession(item)}
                                size="sm"
                                type="button"
                                variant="destructive"
                              >
                                {deletingRecordId === item.recordId ? "删除中..." : "删除"}
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-[53px] shrink-0 items-center gap-3 border-border/60 border-b px-3">
              <Button
                aria-label={shouldShowSessionList ? "收起简历聊天列表" : "展开简历聊天列表"}
                className="size-8 shrink-0"
                disabled={!activeSession}
                onClick={() => setSessionListOpen((value) => !value)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconLayoutSidebarLeftCollapse
                  className={cn(
                    "size-4 transition-transform",
                    !shouldShowSessionList && "rotate-180",
                  )}
                />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{displaySessionTitle(activeSession)}</p>
              </div>
              <Button
                aria-label="关闭简历聊天"
                className="size-8 shrink-0"
                onClick={() => {
                  setSessionListOpen(false);
                  setOpen(false);
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconX className="size-4" />
              </Button>
            </header>

            {activeSession ? (
              <MessageScrollerProvider autoScroll>
                <MessageScroller className="min-h-0 flex-1">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="gap-4 px-4 py-4">
                      {loadError ? (
                        <MessageScrollerItem>
                          <p className="text-destructive text-xs">{loadError}</p>
                        </MessageScrollerItem>
                      ) : null}
                      {visibleMessages.length === 0 ? (
                        <MessageScrollerItem className="min-h-[360px]">
                          <EmptyPanel hasSessions />
                        </MessageScrollerItem>
                      ) : (
                        visibleMessages.map((message, index) => (
                          <MessageScrollerItem
                            className={index === 0 ? "mt-auto" : undefined}
                            key={message.id}
                          >
                            <CompactMessage
                              isStreaming={isStreaming && index === visibleMessages.length - 1}
                              message={message}
                            />
                          </MessageScrollerItem>
                        ))
                      )}
                      {isStreaming && visibleMessages.at(-1)?.role === "user" ? (
                        <MessageScrollerItem>
                          <Message from="assistant">
                            <MessageContent>
                              <Shimmer duration={1.2}>思考中...</Shimmer>
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      ) : null}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton />
                </MessageScroller>
              </MessageScrollerProvider>
            ) : (
              <NoSessionPanel hasSessions={sessions.length > 0} />
            )}

            {error ? (
              <div className="flex items-center justify-between gap-3 border-border/60 border-t px-3 py-2">
                <p className="min-w-0 truncate text-destructive text-xs">回复失败，请稍后重试。</p>
                <Button onClick={clearError} size="sm" type="button" variant="ghost">
                  忽略
                </Button>
              </div>
            ) : null}

            {activeSession ? (
              <footer className="shrink-0 border-border/60 border-t p-3">
                <InputGroup className="items-end">
                  <InputGroupTextarea
                    className="max-h-32 min-h-18 pr-2 text-sm"
                    disabled={isStreaming}
                    onChange={(event) => setInput(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSubmit();
                      }
                    }}
                    placeholder="询问这份简历..."
                    value={input}
                  />
                  <InputGroupAddon
                    align="block-end"
                    className="justify-end border-border/60 border-t"
                  >
                    {isStreaming ? (
                      <InputGroupButton onClick={stop} size="sm" type="button" variant="outline">
                        停止
                      </InputGroupButton>
                    ) : (
                      <InputGroupButton
                        aria-label="发送"
                        disabled={!canSend}
                        onClick={() => void handleSubmit()}
                        size="icon-sm"
                        type="button"
                        variant="default"
                      >
                        <IconSend className="size-4" />
                      </InputGroupButton>
                    )}
                  </InputGroupAddon>
                </InputGroup>
              </footer>
            ) : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
