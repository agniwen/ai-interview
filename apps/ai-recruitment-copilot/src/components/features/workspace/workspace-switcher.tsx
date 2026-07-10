"use client";

import { IconPlus, IconSelector } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceDialog } from "@/components/features/workspace/create-workspace-dialog";
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
 * 点击切换只改变 URL；URL slug 是后端本次请求的唯一工作区上下文。
 * "创建新工作区"入口打开 modal,无需跳转。
 */
export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
        <DropdownMenuTrigger
          render={
            <Button className="gap-2 font-normal" size="sm" variant="ghost">
              <span className="truncate">{label}</span>
              <IconSelector className="h-4 w-4 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          {orgs.length === 0 ? (
            <DropdownMenuItem disabled>暂无可切换的工作区</DropdownMenuItem>
          ) : (
            orgs.map((o) => (
              <DropdownMenuItem
                className={o.slug === currentSlug ? "bg-accent" : ""}
                closeOnClick={false}
                disabled={switching}
                key={o.id}
                onClick={() => {
                  if (o.slug === currentSlug) {
                    return;
                  }
                  setSwitching(true);
                  void (async () => {
                    try {
                      await navigate({ href: resolveSwitchTarget(pathname, o.slug) });
                    } finally {
                      setSwitching(false);
                    }
                  })();
                }}
              >
                <span className="truncate">{o.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => {
              // Keep menu focus from competing with the dialog while it takes over.
              setCreateOpen(true);
            }}
          >
            <IconPlus className="mr-2 h-4 w-4" />
            创建新工作区
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}
