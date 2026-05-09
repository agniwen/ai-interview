"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/client/auth-client";
import type { AdminUserRecord } from "@/server/routes/studio/routes/users/dao";

interface BanUserDialogProps {
  user: AdminUserRecord | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const SECONDS_PER_DAY = 86_400;

export function BanUserDialog({ user, onOpenChange, onSuccess }: BanUserDialogProps) {
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setReason("");
      setDays("");
    }
  }, [user]);

  async function handleSubmit() {
    if (!user) {
      return;
    }
    // 兜底：管理员账号不允许走 UI 封禁，必须由数据库直接处理。
    // Defense-in-depth: admin accounts cannot be banned via UI — DB-only.
    if (user.role === "admin") {
      toast.error("管理员账号不能在 UI 封禁，请由数据库直接处理");
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toast.error("请填写封禁原因");
      return;
    }
    const parsedDays = days.trim() ? Number(days) : 0;
    if (Number.isNaN(parsedDays) || parsedDays < 0) {
      toast.error("封禁天数需要是非负整数；留空表示永久封禁");
      return;
    }

    setSubmitting(true);
    const { error } = await authClient.admin.banUser({
      banExpiresIn: parsedDays > 0 ? parsedDays * SECONDS_PER_DAY : undefined,
      banReason: trimmedReason,
      userId: user.id,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message ?? "封禁失败");
      return;
    }
    toast.success(parsedDays > 0 ? `已封禁 ${parsedDays} 天` : "已永久封禁");
    onSuccess();
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={user !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>封禁用户</DialogTitle>
          <DialogDescription>
            {user ? `即将封禁 ${user.name} (${user.email})。` : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ban-reason">封禁原因</Label>
            <Textarea
              id="ban-reason"
              onChange={(e) => setReason(e.target.value)}
              placeholder="请输入封禁原因"
              rows={3}
              value={reason}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ban-days">封禁天数（留空为永久封禁）</Label>
            <Input
              id="ban-days"
              inputMode="numeric"
              onChange={(e) => setDays(e.target.value)}
              placeholder="例如 7"
              value={days}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={submitting} onClick={handleSubmit} variant="destructive">
            {submitting ? "提交中…" : "确认封禁"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
