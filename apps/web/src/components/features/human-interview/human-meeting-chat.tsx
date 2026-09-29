"use client";
/* oxlint-disable no-use-before-define -- The chat shell stays above its message-list renderer. */

import { useChat, useRoomContext } from "@livekit/components-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconLoader2, IconSend, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@app/shared/utils";
import {
  fetchHumanInterviewChatMessages,
  saveHumanInterviewChatMessage,
} from "@/lib/client/api/endpoints/human-interview-chat";
import type { HumanInterviewChatAccess } from "@/lib/client/api/endpoints/human-interview-chat";

const messageTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

export function HumanMeetingChat({
  access,
  open,
  onClose,
}: {
  access: HumanInterviewChatAccess;
  open: boolean;
  onClose: () => void;
}) {
  const room = useRoomContext();
  const isMobile = useIsMobile();
  const { chatMessages, send } = useChat();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["human-interview-chat", access.mode, access.inviteToken] as const,
    [access.mode, access.inviteToken],
  );
  const { data, isError, isPending, refetch } = useQuery({
    queryFn: () => fetchHumanInterviewChatMessages(access),
    queryKey,
    refetchInterval: 5000,
  });
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const lastLiveMessageId = chatMessages.at(-1)?.id;
  const lastMessageId = data?.messages.at(-1)?.id;

  useEffect(() => {
    if (lastLiveMessageId) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [lastLiveMessageId, queryClient, queryKey]);

  useEffect(() => {
    if (open && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [lastMessageId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!isMobile) {
      textareaRef.current?.focus();
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMobile, onClose, open]);

  useEffect(() => {
    if (!isMobile || !open || !window.visualViewport) {
      return;
    }
    const { visualViewport } = window;
    const updateDrawerBounds = () => {
      const drawer = mobileDrawerRef.current;
      if (!drawer) {
        return;
      }
      drawer.style.top = `${visualViewport.offsetTop}px`;
      drawer.style.height = `${visualViewport.height}px`;
    };
    updateDrawerBounds();
    visualViewport.addEventListener("resize", updateDrawerBounds);
    visualViewport.addEventListener("scroll", updateDrawerBounds);
    return () => {
      visualViewport.removeEventListener("resize", updateDrawerBounds);
      visualViewport.removeEventListener("scroll", updateDrawerBounds);
    };
  }, [isMobile, open]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const id = crypto.randomUUID();
      const saved = await saveHumanInterviewChatMessage(access, { id, message });
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchHumanInterviewChatMessages>>>(
        queryKey,
        (current) => ({
          messages: [...(current?.messages ?? []).filter((item) => item.id !== id), saved.message],
        }),
      );
      setDraft((current) => (current === draft ? "" : current));
      try {
        await send(message, { attributes: { persistedMessageId: id } });
      } catch {
        toast.info("消息已保存，其他参会者稍后会看到");
      }
    } catch {
      toast.error("消息保存失败，请重试");
    } finally {
      setIsSaving(false);
    }
  }

  const content = (
    <>
      <div className="flex shrink-0 items-center gap-2 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Button aria-label="关闭聊天" onClick={onClose} size="icon-sm" variant="ghost">
          <IconX className="size-4" />
        </Button>
        {isMobile ? (
          <DrawerTitle className="text-sm font-medium">聊天</DrawerTitle>
        ) : (
          <h2 className="text-sm font-medium">聊天</h2>
        )}
      </div>
      <ScrollArea
        className="min-h-0 flex-1"
        scrollFade
        scrollbars="leave"
        viewportRef={viewportRef}
      >
        <div aria-live="polite" className="flex min-h-full flex-col gap-4 p-4" role="log">
          <ChatEntries
            isError={isError && !data}
            isPending={isPending}
            localIdentity={room.localParticipant.identity}
            messages={data?.messages}
            onRetry={() => refetch()}
          />
        </div>
      </ScrollArea>
      <form
        className="flex shrink-0 items-end gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={handleSend}
      >
        <div className="min-w-0 flex-1">
          <textarea
            aria-label="输入聊天消息"
            className="field-sizing-content block max-h-32 min-h-10 w-full resize-none rounded-md bg-muted/40 px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:bg-muted/60 md:text-sm"
            ref={textareaRef}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="发送消息给参会者"
            rows={1}
            value={draft}
          />
        </div>
        <Button
          aria-label="发送消息"
          className="border-border/30"
          disabled={!draft.trim() || isSaving}
          size="icon-lg"
          type="submit"
          variant="secondary"
        >
          {isSaving ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconSend className="size-4" />
          )}
        </Button>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        direction="bottom"
        onOpenChange={(value) => !value && onClose()}
        open={open}
        repositionInputs={false}
      >
        <DrawerContent
          className="!inset-x-0 !bottom-auto !mt-0 h-dvh !max-h-none !w-screen !max-w-none !rounded-none !border-0 top-0"
          data-slot="meeting-chat-panel"
          hideHandle
          ref={mobileDrawerRef}
        >
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside
      aria-label="会议聊天"
      className={cn(
        "absolute right-3 bottom-3 z-30 h-[32rem] max-h-[calc(100%-1.5rem)] w-96 flex-col overflow-hidden rounded-xl border bg-background shadow-lg",
        open ? "flex" : "hidden",
      )}
      data-slot="meeting-chat-panel"
    >
      {content}
    </aside>
  );
}

type ChatMessage = Awaited<ReturnType<typeof fetchHumanInterviewChatMessages>>["messages"][number];

function ChatEntries({
  isError,
  isPending,
  localIdentity,
  messages,
  onRetry,
}: {
  isError: boolean;
  isPending: boolean;
  localIdentity: string;
  messages: ChatMessage[] | undefined;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <div className="my-auto flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <span>聊天记录加载失败</span>
        <Button onClick={onRetry} size="sm" variant="outline">
          重试
        </Button>
      </div>
    );
  }
  if (isPending) {
    return <p className="my-auto text-center text-sm text-muted-foreground">加载中…</p>;
  }
  if (!messages?.length) {
    return <p className="my-auto text-center text-sm text-muted-foreground">暂无消息</p>;
  }
  return messages.map((message) => {
    const isLocal = message.participantIdentity === localIdentity;
    return (
      <div className={cn("flex min-w-0 flex-col gap-1", isLocal && "items-end")} key={message.id}>
        <div className="flex max-w-full items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{isLocal ? "我" : message.senderName}</span>
          <time dateTime={message.timestamp}>
            {messageTimeFormatter.format(new Date(message.timestamp))}
          </time>
        </div>
        <p
          className={cn(
            "w-fit max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-xl px-3 py-2 text-sm",
            isLocal
              ? "bg-[color-mix(in_srgb,var(--muted),var(--color-black)_4%)] text-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {message.message}
        </p>
      </div>
    );
  });
}
