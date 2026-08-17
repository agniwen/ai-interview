"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { createContext, useContext, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { SidebarInsetHeader } from "@/components/layout/app-sidebar/sidebar-inset-header";
import { WorkspaceSwitcher } from "@/components/features/workspace/workspace-switcher";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_CHAT_HEADER_TITLE = "简历筛选助手";
const GENERATING_CHAT_TITLE = "生成中...";
const UNTITLED_CHAT_TITLE = "未命名对话";

interface SessionTitle {
  sessionId: string;
  title: string;
}

const ChatHeaderTitleContext = createContext<SessionTitle | null>(null);
const ChatHeaderTitleSetterContext = createContext<Dispatch<
  SetStateAction<SessionTitle | null>
> | null>(null);

export function getVisibleConversationTitle({
  isTitleGenerating,
  title,
}: {
  isTitleGenerating: boolean;
  title: string;
}) {
  if (isTitleGenerating) {
    return GENERATING_CHAT_TITLE;
  }
  return title.trim() || UNTITLED_CHAT_TITLE;
}

export function resolveChatHeaderTitle(
  activeSessionId: string | null,
  sessionTitle: SessionTitle | null,
) {
  if (!activeSessionId) {
    return DEFAULT_CHAT_HEADER_TITLE;
  }
  if (sessionTitle?.sessionId !== activeSessionId) {
    return null;
  }
  return sessionTitle.title;
}

export function ChatHeaderTitleProvider({ children }: { children: ReactNode }) {
  const [sessionTitle, setSessionTitle] = useState<SessionTitle | null>(null);

  return (
    <ChatHeaderTitleSetterContext.Provider value={setSessionTitle}>
      <ChatHeaderTitleContext.Provider value={sessionTitle}>
        {children}
      </ChatHeaderTitleContext.Provider>
    </ChatHeaderTitleSetterContext.Provider>
  );
}

export function useSetChatHeaderTitle() {
  const setSessionTitle = useContext(ChatHeaderTitleSetterContext);
  if (!setSessionTitle) {
    throw new Error("useSetChatHeaderTitle must be used within ChatHeaderTitleProvider");
  }
  return setSessionTitle;
}

export function ChatHeader() {
  const activeSessionId = useParams({
    select: (params) => (typeof params.sessionId === "string" ? params.sessionId : null),
    strict: false,
  });
  const sessionTitle = useContext(ChatHeaderTitleContext);
  const title = resolveChatHeaderTitle(activeSessionId, sessionTitle);

  return (
    <SidebarInsetHeader
      actions={<WorkspaceSwitcher />}
      breadcrumb={
        <Breadcrumb>
          <BreadcrumbList className="min-w-0 flex-nowrap">
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage
                className="max-w-[min(50vw,32rem)] truncate"
                title={title ?? undefined}
              >
                {title ?? <Skeleton aria-label="会话标题加载中" className="h-4 w-32" />}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    />
  );
}
