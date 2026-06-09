"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/client/auth-client";

/**
 * "已登录但权限不足"提示弹窗。点击确认后退出当前账号并返回首页。
 * 直接 redirect 回 /login 会立刻被服务端的会话检查再次甩到这里 → 死循环，
 * 所以必须先 signOut 再 navigate。
 *
 * "Logged in but lacks admin permission" notice. Confirming signs the user
 * out and sends them home. Cannot redirect to /login directly because the
 * server-side session check would loop us back here.
 */
export function UnauthorizedNotice() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleConfirm = async () => {
    setOpen(false);
    setIsRedirecting(true);

    try {
      await authClient.signOut();
    } catch {
      // Ignore sign-out failures and continue redirecting.
    } finally {
      await router.navigate({ replace: true, to: "/" });
      void router.invalidate();
    }
  };

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center"
      id="main-content"
    >
      <AlertDialog open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>权限不足</AlertDialogTitle>
            <AlertDialogDescription>
              当前账号没有管理员权限，无法访问此页面。点击确认后将退出登录并返回首页。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleConfirm}>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isRedirecting && (
        <>
          <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">正在退出当前账号并返回首页...</p>
        </>
      )}
    </main>
  );
}
