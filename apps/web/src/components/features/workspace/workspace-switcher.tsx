"use client";

import { IconBuilding, IconPlus, IconSelector } from "@tabler/icons-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceDialog } from "@/components/features/workspace/create-workspace-dialog";
import { withCleanup } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useWorkspaceOrganizations } from "./use-workspace-organizations";

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
 * 顶栏和用户菜单共用的工作区切换器。列出当前用户所在所有 workspace,
 * 点击切换只改变 URL；URL slug 是后端本次请求的唯一工作区上下文。
 * "创建新工作区"入口打开 modal,无需跳转。
 */
export function WorkspaceSwitcher({ submenu = false }: { submenu?: boolean } = {}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentSlug = useWorkspaceSlug();
  const [createOpen, setCreateOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const { data: orgs = [] } = useWorkspaceOrganizations();

  const active = orgs.find((o) => o.slug === currentSlug);
  const label = active?.name ?? currentSlug;

  const menuItems = (
    <>
      {orgs.length === 0 ? (
        <DropdownMenuItem disabled>暂无可切换的工作区</DropdownMenuItem>
      ) : (
        orgs.map((o) => (
          <DropdownMenuItem
            className={o.slug === currentSlug ? "bg-accent" : ""}
            closeOnClick={submenu}
            disabled={switching}
            key={o.id}
            onClick={() => {
              if (o.slug === currentSlug) {
                return;
              }
              setSwitching(true);
              void withCleanup(
                () => navigate({ href: resolveSwitchTarget(pathname, o.slug) }),
                () => {
                  setSwitching(false);
                },
              );
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
    </>
  );

  return (
    <>
      {submenu ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconBuilding className="mr-2 size-4" />
            切换工作区
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">{menuItems}</DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
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
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  );
}
