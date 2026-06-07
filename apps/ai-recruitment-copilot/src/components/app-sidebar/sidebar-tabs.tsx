"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/client/auth-client";

type SidebarTabValue = "chat" | "studio";

// 从 pathname 解析当前 workspace slug;非 /w/[slug]/* 路径返回 null。
function extractWorkspaceSlug(pathname: string): string | null {
  const match = pathname.match(/^\/w\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function resolveActiveTab(pathname: string): SidebarTabValue | null {
  if (!pathname.startsWith("/w/")) {
    return null;
  }
  if (pathname.includes("/studio")) {
    return "studio";
  }
  if (pathname.includes("/chat")) {
    return "chat";
  }
  return null;
}

export function SidebarTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const activeOrganization = authClient.useActiveOrganization();
  const activeTab = resolveActiveTab(pathname);
  const slug = extractWorkspaceSlug(pathname) ?? activeOrganization.data?.slug ?? null;

  const handleChange = (value: string) => {
    // 缺 slug 时无法构造路径——回到根路径让根路由解析活跃 workspace。
    // Without a slug we can't build the target — fall back to root and let
    // src/app/page.tsx redirect to the active workspace.
    if (!slug) {
      router.push("/");
      return;
    }

    const nextTab = value as SidebarTabValue;
    const target = nextTab === "chat" ? `/w/${slug}/chat` : `/w/${slug}/studio/resumes`;

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
