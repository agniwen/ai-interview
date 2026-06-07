"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { authClient } from "@/lib/client/auth-client";

// 切换工作区时保留页面"类型",丢掉记录级别的 id——目标 workspace 没有同一个 id。
// - /w/A/chat[/anything]              → /w/B/chat        (空会话)
// - /w/A/studio/interviews[/anything] → /w/B/studio/interviews  (列表)
// - /w/A/studio                       → /w/B
// - /w/A                              → /w/B
// Switching workspace preserves the page *kind*, not the specific record:
// detail-page ids don't exist in the other workspace.
function resolveSwitchTarget(currentPath: string, nextSlug: string): string {
  const match = currentPath.match(/^\/w\/[^/]+(?:\/([^/]+)(?:\/([^/]+))?)?/);
  const section = match?.[1];
  const subsection = match?.[2];

  if (section === "chat") {
    return `/w/${nextSlug}/chat`;
  }
  if (section === "studio" && subsection) {
    return `/w/${nextSlug}/studio/${subsection}`;
  }
  return `/w/${nextSlug}`;
}

/**
 * Sidebar inset header 里的工作区切换器。列出当前用户所在所有 workspace,
 * 点击切换会把 router 推到对应 slug 的 root,layout 里再 setActiveOrganization。
 * "创建新工作区"入口打开 modal,无需跳转。
 */
export function WorkspaceSwitcher() {
  const pathname = usePathname();
  const currentSlug = useWorkspaceSlug();
  const [createOpen, setCreateOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const { data: orgs = [] } = useQuery({
    queryFn: async () => {
      const result = await authClient.organization.list();
      return result.data ?? [];
    },
    queryKey: ["organizations"],
  });

  const active = orgs.find((o) => o.slug === currentSlug);
  const label = active?.name ?? currentSlug;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="gap-2 font-normal" size="sm" variant="ghost">
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {orgs.length === 0 ? (
            <DropdownMenuItem disabled>暂无可切换的工作区</DropdownMenuItem>
          ) : (
            orgs.map((o) => (
              <DropdownMenuItem
                className={o.slug === currentSlug ? "bg-accent" : ""}
                disabled={switching}
                key={o.id}
                onSelect={(e) => {
                  if (o.slug === currentSlug) {
                    return;
                  }
                  // 先把 active org cookie 切到目标 workspace，再硬导航。
                  // 不能反过来：layout.tsx 里 setActiveOrganization 用的是 React cache 的 session,
                  // 同请求里写 Set-Cookie 也"看不见"——本次 server-render 还是用旧 active org，
                  // 表现为切换后 page 数据"慢一拍"（要再刷一次才生效）。
                  // 这里同步等 setActive 写好 cookie，浏览器再发的请求自带新 active id，
                  // server 端 getCurrentSession / resolveActiveOrganization 一次性拿到正确 org。
                  // Set the active-org cookie BEFORE navigating. Doing it on the server
                  // inside the new layout doesn't work in the same render because
                  // getCurrentSession is React-cached and already memoized the old
                  // session — manifests as "the page lags one switch behind".
                  // Awaiting setActive here makes the next request carry the new
                  // active-id, so the server resolves the right org on first read.
                  e.preventDefault();
                  setSwitching(true);
                  void (async () => {
                    try {
                      await authClient.organization.setActive({ organizationId: o.id });
                    } catch (error) {
                      console.error("[workspace-switch] setActive failed", error);
                    }
                    window.location.assign(resolveSwitchTarget(pathname, o.slug));
                  })();
                }}
              >
                <span className="truncate">{o.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              // 阻止默认关闭,等 dropdown 自然收起后再让 Dialog 接管焦点。
              // Prevent the default close so Radix doesn't fight Dialog for focus.
              e.preventDefault();
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            创建新工作区
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}
