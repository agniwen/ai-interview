"use client";

// 工作区「待处理邀请」列表 + 撤销。better-auth 的 listInvitations 不带过滤
// 参数，会回 pending/accepted/rejected/canceled 全部状态——本组件只展示
// status === "pending" 的行；其余视为历史。撤销走 cancelInvitation，
// 服务端会把 status 改成 "canceled"，列表里会自动消失（refetch 后）。
//
// Workspace "pending invitations" list + cancel. better-auth's
// listInvitations returns all statuses; we filter to pending here. Cancel
// goes through cancelInvitation (status -> "canceled").

import { useQuery } from "@tanstack/react-query";
import { CopyIcon, MailIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/shared/auth-client";
import { formatDate } from "@/lib/shared/utils/time";
import { getWorkspaceRoleLabel } from "./role-display";
import type { WorkspaceRole } from "./role-display";

interface InvitationItem {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string | Date;
}

function InvitationsBody({
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
    return <p className="text-muted-foreground text-sm">暂无待处理邀请。</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((inv) => (
        <li
          className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
          key={inv.id}
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{inv.email}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              {inv.role ? (
                <Badge variant="secondary">
                  {getWorkspaceRoleLabel(inv.role as WorkspaceRole)}
                </Badge>
              ) : null}
              <span>过期：{formatDate(inv.expiresAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button onClick={() => copyLink(inv.id)} size="sm" type="button" variant="outline">
              <CopyIcon className="size-4" />
              复制链接
            </Button>
            <Button
              disabled={pending === inv.id}
              onClick={() => cancel(inv.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              <XIcon className="size-4" />
              撤销
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PendingInvitationsSection({ organizationId }: { organizationId: string | null }) {
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

  async function copyLink(invitationId: string) {
    const url = `${window.location.origin}/invite/${invitationId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("邀请链接已复制");
    } catch {
      toast.error(`复制失败，请手动复制：${url}`);
    }
  }

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailIcon className="size-4" />
          待处理邀请
        </CardTitle>
        <CardDescription>
          邀请发出后未接受、未过期的记录。可复制邀请链接发给对方，或随时撤销。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InvitationsBody
          cancel={cancel}
          copyLink={copyLink}
          isPending={isPending}
          items={items}
          pending={pending}
        />
      </CardContent>
    </Card>
  );
}
