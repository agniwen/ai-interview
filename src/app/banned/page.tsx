"use client";

import { LoaderCircleIcon, ShieldAlertIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/auth-client";

// =====================================================================
// 飞书 OAuth 回调时若 better-auth admin 检测到用户被封禁，会重定向到这里，
// query: ?error=banned&error_description=<bannedUserMessage>
// Banned-user landing page hit when better-auth admin redirects an OAuth
// callback for a banned account: ?error=...&error_description=<msg>.
// =====================================================================

function BannedDialog() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const errorCode = params.get("error");
  const errorDescription = params.get("error_description");
  const isBanned = errorCode === "banned";

  const title = isBanned ? "账号已被封禁" : "登录失败";
  const description = isBanned
    ? (errorDescription ?? "你的账号已被封禁。如果你认为这是误判，请联系管理员。")
    : (errorDescription ?? "登录过程中发生错误，请稍后再试。");

  async function handleConfirm() {
    setOpen(false);
    setIsRedirecting(true);
    try {
      // 已经是被封禁状态时通常没有 session，但兜底退一次。
      // Usually no session exists for a banned login, but sign out defensively.
      await authClient.signOut();
    } catch {
      // ignore
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <>
      <AlertDialog open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ShieldAlertIcon className="size-5" />
              </div>
              <div className="flex flex-col gap-1.5">
                <AlertDialogTitle>{title}</AlertDialogTitle>
                <AlertDialogDescription>{description}</AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleConfirm}>返回首页</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isRedirecting && (
        <>
          <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">正在返回首页...</p>
        </>
      )}
    </>
  );
}

export default function BannedPage() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center"
      id="main-content"
    >
      <Suspense fallback={null}>
        <BannedDialog />
      </Suspense>
    </main>
  );
}
