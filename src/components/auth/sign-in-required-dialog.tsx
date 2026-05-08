"use client";

import { Modal } from "@/components/ui/modal";
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
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="为了保存你的会话、同步简历分析记录和面试结果，请先使用飞书账号登录。"
      size="sm"
      className="rounded-3xl border-border/70 bg-card/95 shadow-[0_30px_90px_-42px_rgba(30,72,132,0.55)] backdrop-blur-xl"
      headerClassName="space-y-1 border-b-0 pb-2"
      bodyClassName="px-7 pb-7 pt-2 space-y-3"
    >
      <FeishuSignInButton callbackURL={callbackURL} />
      <FeishuSignInButton
        callbackURL={callbackURL}
        label="极光 HR 飞书登录"
        providerId="feishu-jiguang-hr"
        variant="primary"
      />
    </Modal>
  );
}
