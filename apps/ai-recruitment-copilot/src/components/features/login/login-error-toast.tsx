"use client";

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { getBannedAuthMessage } from "@/components/features/auth/auth-error";
import { authClient } from "@/lib/client/auth-client";

interface LoginErrorToastProps {
  errorCode: string;
  errorDescription?: string | undefined;
}

const DEFAULT_GENERIC_MESSAGE = "登录过程中发生错误，请稍后再试。";

/**
 * 客户端组件：在 OAuth 回调失败（例如账号被封禁）后，把错误信息以 toast 的形式
 * 弹给用户，并兜底 sign out 一次（封禁用户通常没有 session，但防止脏会话）。
 * 弹完之后把 URL 上的 `error` / `error_description` 清掉，刷新不会再弹一次。
 *
 * Surfaces an OAuth error (e.g. banned account) as a toast on /login mount.
 * Also performs a defensive sign-out (banned accounts usually have no session,
 * but this clears any stale state). After firing, strips the error params
 * from the URL so a refresh won't re-trigger it.
 */
export function LoginErrorToast({ errorCode, errorDescription }: LoginErrorToastProps) {
  const navigate = useNavigate();
  // useEffect 在 React strict mode 下会触发两次；ref 守护避免重复弹 toast。
  // Strict-mode double-invocation guard so the toast doesn't fire twice.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) {
      return;
    }
    firedRef.current = true;

    const isBanned = errorCode === "banned";
    const message = isBanned
      ? getBannedAuthMessage(errorDescription)
      : errorDescription?.trim() || DEFAULT_GENERIC_MESSAGE;

    toast.error(message, { duration: isBanned ? 8000 : 6000 });

    // 防御性签出：被封禁的 OAuth 回调一般没有 session；这里兜一刀清掉脏状态。
    // Defensive sign-out — usually a no-op for banned OAuth flows.
    void (async () => {
      try {
        await authClient.signOut();
      } catch {
        // ignore
      }
      if (isBanned) {
        await navigate({ replace: true, to: "/" });
      }
    })();

    // 把 error / error_description 从 URL 上摘掉，避免刷新重复弹 toast。
    // Strip error params from the URL so refresh won't re-fire the toast.
    const cleaned = new URLSearchParams(window.location.search);
    cleaned.delete("error");
    cleaned.delete("error_description");
    const next = cleaned.toString();
    const pathname = window.location.pathname || "/login";
    window.history.replaceState(window.history.state, "", next ? `${pathname}?${next}` : pathname);
  }, [errorCode, errorDescription, navigate]);

  return null;
}
