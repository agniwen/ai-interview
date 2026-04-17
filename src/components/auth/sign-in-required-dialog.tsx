"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeishuSignInButton } from "./feishu-sign-in-button";

interface SignInRequiredDialogProps {
  callbackURL: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function SignInRequiredDialog({
  callbackURL,
  open,
  onOpenChange,
  title = "先登录后继续",
}: SignInRequiredDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md rounded-3xl border-border/70 bg-card/95 p-7 shadow-[0_30px_90px_-42px_rgba(30,72,132,0.55)] backdrop-blur-xl">
        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="pixel-title text-xl text-foreground">{title}</DialogTitle>
          <DialogDescription className="font-serif text-sm leading-relaxed text-muted-foreground">
            为了保存你的会话、同步简历分析记录和面试结果，请先使用飞书账号登录。
          </DialogDescription>
        </DialogHeader>

        <FeishuSignInButton callbackURL={callbackURL} />
      </DialogContent>
    </Dialog>
  );
}
