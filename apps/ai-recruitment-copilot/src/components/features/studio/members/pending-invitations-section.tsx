"use client";

import { IconCopy, IconMail, IconX } from "@tabler/icons-react";
// 「待处理邀请」侧滑面板 + 触发按钮。原先做成主页底部一张大 Card，占位太重；
// 改成右侧 Sheet：默认收起，按钮带未处理数量徽章，点击展开后看列表 + 撤销。
// better-auth 的 listInvitations 不带状态过滤，返回 pending/accepted/...
// 全部状态——本组件只在 UI 层过滤 status === "pending"。
//
// Pending-invitations side sheet + trigger button. Replaces the heavy
// always-visible card with an on-demand drawer; the button shows a count
// badge. listInvitations returns all statuses; we filter to pending here.

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/client/auth-client";
import { formatDate } from "@arc/shared/utils/time";
import { getWorkspaceRoleLabel } from "./role-display";

interface InvitationItem {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string | Date;
}

function InvitationsList({
  isPending,
  items,
  pending,
  copyLink,
  cancel,
}: {
  isPending: boolean;
  items: InvitationItem[];
  pending: string | null;
  copyLink: (invitationId: string) => Promise<void>;
  cancel: (invitationId: string) => Promise<void>;
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Spinner className="size-4" />
        加载中…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-12 text-center text-muted-foreground text-sm">
        暂无待处理邀请。
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((inv) => (
        <li className="rounded-md border bg-background p-3" key={inv.id}>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{inv.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              {inv.role ? (
                <Badge variant="secondary">{getWorkspaceRoleLabel(inv.role)}</Badge>
              ) : null}
              <span>过期：{formatDate(inv.expiresAt)}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              className="flex-1"
              onClick={() => copyLink(inv.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconCopy className="size-4" />
              复制链接
            </Button>
            <Button
              className="flex-1"
              disabled={pending === inv.id}
              onClick={() => cancel(inv.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconX className="size-4" />
              撤销
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function copyInvitationLink(invitationId: string) {
  const url = `${window.location.origin}/invite/${invitationId}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("邀请链接已复制");
  } catch {
    toast.error(`复制失败，请手动复制：${url}`);
  }
}

export function PendingInvitationsButton({ organizationId }: { organizationId: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const { data, isPending, refetch } = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<InvitationItem[]> => {
      const { data: list, error } = await authClient.organization.listInvitations();
      if (error) {
        throw new Error(error.message ?? "加载邀请列表失败");
      }
      return (list ?? []) as InvitationItem[];
    },
    queryKey: ["workspace-invitations", organizationId],
    refetchOnWindowFocus: false,
  });

  const items = (data ?? []).filter((inv) => inv.status === "pending");
  const count = items.length;

  async function cancel(invitationId: string) {
    setPending(invitationId);
    const { error } = await authClient.organization.cancelInvitation({ invitationId });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "撤销失败");
      return;
    }
    toast.success("邀请已撤销");
    await refetch();
  }

  if (!organizationId) {
    return null;
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          <IconMail className="size-4" />
          待处理邀请
          {count > 0 ? (
            <Badge className="ml-1" variant="secondary">
              {count}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>待处理邀请</SheetTitle>
          <SheetDescription>
            邀请发出后未接受、未过期的记录。可复制邀请链接发给对方，或随时撤销。
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <InvitationsList
            cancel={cancel}
            copyLink={copyInvitationLink}
            isPending={isPending}
            items={items}
            pending={pending}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
