"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/client/auth-client";

const ROLE_OPTIONS = ["admin", "hr", "viewer"] as const;

interface InviteDialogProps {
  /** 自定义触发节点；省略则用默认"邀请成员"按钮。 */
  trigger?: ReactNode;
}

export function InviteDialog({ trigger }: InviteDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("hr");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    const { data, error } = await authClient.organization.inviteMember({
      email: email.trim(),
      role,
    });
    setSubmitting(false);
    if (error || !data) {
      toast.error(error?.message ?? "邀请失败");
      return;
    }
    const url = `${window.location.origin}/invite/${data.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`邀请链接已复制到剪贴板: ${url}`);
    } catch {
      toast.success(`邀请链接已生成: ${url}`);
    }
    setOpen(false);
    setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button>邀请成员</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>邀请新成员</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">邮箱</Label>
            <Input
              id="invite-email"
              placeholder="someone@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">角色</Label>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLE_OPTIONS)[number])}>
              <SelectTrigger id="invite-role">
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
          </div>
          <Button disabled={submitting || !email} onClick={onSubmit}>
            {submitting ? "生成邀请..." : "生成邀请链接"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
