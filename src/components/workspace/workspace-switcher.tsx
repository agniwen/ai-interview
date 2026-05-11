"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

/**
 * Sidebar 顶部的工作区切换器。列出当前用户所在所有 workspace,
 * 点击切换会把 router 推到对应 slug 的 root,layout 里再 setActiveOrganization。
 * 顶部"创建新工作区"入口固定指到 /create-workspace。
 */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const currentSlug = useWorkspaceSlug();

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-between font-normal">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.length === 0 ? (
          <DropdownMenuItem disabled>暂无可切换的工作区</DropdownMenuItem>
        ) : (
          orgs.map((o) => (
            <DropdownMenuItem
              key={o.id}
              className={o.slug === currentSlug ? "bg-accent" : ""}
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
        <DropdownMenuItem onClick={() => router.push("/create-workspace")}>
          <Plus className="mr-2 h-4 w-4" />
          创建新工作区
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
