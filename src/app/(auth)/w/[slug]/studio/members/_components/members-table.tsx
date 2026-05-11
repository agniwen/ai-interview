"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PermissionGate } from "@/components/permission/permission-gate";
import { authClient } from "@/lib/client/auth-client";

const ROLE_OPTIONS = ["owner", "admin", "hr", "viewer"] as const;

export function MembersTable() {
  const { data: org, refetch, isPending } = authClient.useActiveOrganization();
  const [pending, setPending] = useState<string | null>(null);
  const members = org?.members ?? [];

  async function changeRole(memberId: string, role: string) {
    setPending(memberId);
    const { error } = await authClient.organization.updateMemberRole({
      memberId,
      role: role as "owner" | "admin" | "hr" | "viewer",
    });
    setPending(null);
    if (error) {
      toast.error(error.message ?? "更新角色失败");
      return;
    }
    await refetch();
  }

  function removeMember(memberId: string) {
    toast("确定移除该成员？", {
      action: {
        label: "确认移除",
        onClick: async () => {
          setPending(memberId);
          const { error } = await authClient.organization.removeMember({
            memberIdOrEmail: memberId,
          });
          setPending(null);
          if (error) {
            toast.error(error.message ?? "移除成员失败");
            return;
          }
          await refetch();
        },
      },
    });
  }

  if (isPending) {
    return <div className="p-4 text-muted-foreground">加载中...</div>;
  }

  if (members.length === 0) {
    return <div className="p-4 text-muted-foreground">暂无成员。</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>邮箱</TableHead>
          <TableHead>姓名</TableHead>
          <TableHead>角色</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => {
          const email = (m as { user?: { email?: string } }).user?.email ?? "—";
          const name = (m as { user?: { name?: string } }).user?.name ?? "—";
          return (
            <TableRow key={m.id}>
              <TableCell>{email}</TableCell>
              <TableCell>{name}</TableCell>
              <TableCell>
                <PermissionGate
                  action="update"
                  fallback={<span className="text-sm">{m.role}</span>}
                  resource="member"
                >
                  <Select
                    disabled={pending === m.id}
                    value={m.role}
                    onValueChange={(v) => changeRole(m.id, v)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PermissionGate>
              </TableCell>
              <TableCell className="text-right">
                <PermissionGate action="delete" resource="member">
                  <Button
                    disabled={pending === m.id}
                    size="sm"
                    variant="ghost"
                    onClick={() => removeMember(m.id)}
                  >
                    移除
                  </Button>
                </PermissionGate>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
