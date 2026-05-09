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
import { apiFetch, ApiError } from "@/lib/api";
import type { AdminUserRecord } from "@/server/routes/studio/routes/users/dao";

interface SetPasswordDialogProps {
  user: AdminUserRecord | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const MIN_PASSWORD_LENGTH = 8;

export function SetPasswordDialog({ user, onOpenChange, onSuccess }: SetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 切换不同用户时清掉旧输入。
  // Reset inputs when the target user changes.
  useEffect(() => {
    if (user) {
      setPassword("");
      setConfirmPassword("");
    }
  }, [user]);

  async function handleSubmit() {
    if (!user) {
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`密码长度至少 ${MIN_PASSWORD_LENGTH} 位`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      // 走自建 /api/studio/users/:id/password。better-auth 的 setUserPassword 对没有
      // credential account 的用户（飞书 OAuth 登录的）会静默失败，所以这里改用
      // upsert credential account 的自定义实现。
      // Use our custom endpoint; better-auth's setUserPassword silently no-ops for
      // users without a credential account (Feishu OAuth users).
      await apiFetch(`/api/studio/users/${user.id}/password`, {
        body: { password },
        method: "POST",
      });
      toast.success("密码已更新");
      onSuccess();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "密码设置失败";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={user !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置用户密码</DialogTitle>
          <DialogDescription>
            为该用户重置登录密码。请使用安全渠道告知本人，并提醒首次登录后立即修改。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="set-pwd-account">账号</Label>
            <Input
              id="set-pwd-account"
              readOnly
              value={user ? `${user.name} <${user.email}>` : ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-pwd-password">新密码</Label>
            <Input
              autoComplete="new-password"
              id="set-pwd-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
              type="password"
              value={password}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="set-pwd-confirm">确认密码</Label>
            <Input
              autoComplete="new-password"
              id="set-pwd-confirm"
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
              type="password"
              value={confirmPassword}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            {submitting ? "提交中…" : "确认"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
