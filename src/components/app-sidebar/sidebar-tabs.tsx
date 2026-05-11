"use client";

import { atom, useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { ChatSessionPathUpdatedDetail } from "@/app/(auth)/chat/_lib/chat-events";
import { CHAT_EVENTS } from "@/app/(auth)/chat/_lib/chat-events";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SidebarTabValue = "chat" | "studio";

// 从 pathname 解析当前 workspace slug；非 /w/[slug]/* 路径返回 null。
// Studio 已经平移到 /w/[slug]/studio/*，所以切到 Studio tab 时必须带上 slug。
// Chat 仍然挂在顶层 /chat,不与 workspace 路径耦合。
function extractWorkspaceSlug(pathname: string): string | null {
  const match = pathname.match(/^\/w\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function studioDefaultPath(slug: string | null): string | null {
  return slug ? `/w/${slug}/studio/interviews` : null;
}

const CHAT_DEFAULT_PATH = "/chat";

const tabLastPathAtom = atom<Record<SidebarTabValue, string | null>>({
  chat: null,
  studio: null,
});

function resolveActiveTab(pathname: string): SidebarTabValue | null {
  if (pathname.startsWith("/w/") && pathname.includes("/studio")) {
    return "studio";
  }

  if (pathname.startsWith("/chat")) {
    return "chat";
  }

  return null;
}

export function SidebarTabs({ canAccessAdmin }: { canAccessAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = useMemo(() => resolveActiveTab(pathname), [pathname]);
  const currentSlug = useMemo(() => extractWorkspaceSlug(pathname), [pathname]);
  const [tabLastPath, setTabLastPath] = useAtom(tabLastPathAtom);

  // Keep the active tab's last-visited path in sync so that tab switching
  // can restore it on return.
  // 同步记录当前 tab 最近访问的路径，便于回切时还原。
  useEffect(() => {
    if (!activeTab) {
      return;
    }

    setTabLastPath((prev) =>
      prev[activeTab] === pathname ? prev : { ...prev, [activeTab]: pathname },
    );
  }, [activeTab, pathname, setTabLastPath]);

  // Warm up the *other* tab's route so clicking the tab feels instant —
  // without this, router.push pays the full chunk + RSC payload cost on
  // first switch. Re-runs when the remembered last-path changes.
  // 预取另一侧 tab 的路由，避免首次切换时拉 chunk + RSC 造成卡顿。
  useEffect(() => {
    const studioDefault = studioDefaultPath(currentSlug);
    const chatTarget = tabLastPath.chat ?? CHAT_DEFAULT_PATH;
    const studioTarget = tabLastPath.studio ?? studioDefault;
    const otherTarget = activeTab === "studio" ? chatTarget : studioTarget;
    if (otherTarget) {
      router.prefetch(otherTarget);
    }
  }, [activeTab, currentSlug, router, tabLastPath.chat, tabLastPath.studio]);

  // The chat page transitions from `/chat` to `/chat/[sessionId]` via
  // `history.replaceState` (soft URL update, invisible to Next's router)
  // so `usePathname()` never observes the new path. Listen to the chat
  // page's explicit `chat:session-path-updated` event to record the real
  // pathname, so a Studio → Chat tab bounce lands back on the conversation.
  useEffect(() => {
    const handleSessionPathUpdated = (event: Event) => {
      const { detail } = event as CustomEvent<ChatSessionPathUpdatedDetail>;
      const nextPathname = detail?.pathname;
      if (!nextPathname) {
        return;
      }
      setTabLastPath((prev) =>
        prev.chat === nextPathname ? prev : { ...prev, chat: nextPathname },
      );
    };

    window.addEventListener(CHAT_EVENTS.sessionPathUpdated, handleSessionPathUpdated);
    return () => {
      window.removeEventListener(CHAT_EVENTS.sessionPathUpdated, handleSessionPathUpdated);
    };
  }, [setTabLastPath]);

  if (!canAccessAdmin) {
    return null;
  }

  const handleChange = (value: string) => {
    const nextTab = value as SidebarTabValue;

    // tab 上次记录的路径优先；否则用默认值（studio 必须依赖当前 slug）。
    let target = tabLastPath[nextTab];
    if (!target) {
      target = nextTab === "chat" ? CHAT_DEFAULT_PATH : studioDefaultPath(currentSlug);
    }

    // studio 切换缺 slug 时无法构造路径——返回首页让根路由解析活跃 workspace。
    if (!target) {
      router.push("/");
      return;
    }

    if (target !== pathname) {
      router.push(target);
    }
  };

  return (
    <Tabs
      // Manual activation: Radix's default "automatic" mode calls
      // onValueChange on focus — when sonner restores focus to the
      // previously-active tab trigger after dismissing a toast, that
      // would route us back to the wrong tab.
      activationMode="manual"
      className="w-full group-data-[collapsible=icon]:hidden"
      onValueChange={handleChange}
      value={activeTab ?? "chat"}
    >
      <TabsList className="w-full">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="studio">Studio</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
