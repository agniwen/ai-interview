"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { authClient } from "@/lib/shared/auth-client";

/**
 * Sidebar inset header 里的工作区切换器。列出当前用户所在所有 workspace,
 * 点击切换会把 router 推到对应 slug 的 root,layout 里再 setActiveOrganization。
 * "创建新工作区"入口打开 modal,无需跳转。
 */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const currentSlug = useWorkspaceSlug();
  const [createOpen, setCreateOpen] = useState(false);

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
                key={o.id}
                onClick={() => {
                  if (o.slug !== currentSlug) {
                    router.push(`/w/${o.slug}`);
                  }
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
