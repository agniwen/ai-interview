"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/shared/auth-client";
import { cn } from "@/lib/shared/utils";
import { GoogleIcon } from "./google-icon";

interface GoogleSignInButtonProps {
  callbackURL: string;
  className?: string;
}

// 生产环境必须把 callbackURL 拼成绝对 URL，否则 better-auth 在做 Google OAuth 跳转
// 时会把它落到错误的 host（服务端 baseURL fallback 到 localhost），导致登录回来跳
// 到 localhost。优先用 NEXT_PUBLIC_BASE_URL，无 window 时（不会发生在客户端组件，
// 留 fallback 仅为类型安全）才退回相对路径。
// In production callbackURL must be absolute so better-auth doesn't resolve it
// against a wrong base host (e.g. the server's localhost fallback) and ship the
// user back to localhost after Google OAuth. Prefer NEXT_PUBLIC_BASE_URL; fall
// back to window.location.origin for the rare case the env var is unset.
function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ??
    (typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function GoogleSignInButton({ callbackURL, className }: GoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setIsSubmitting(true);
    const result = await authClient.signIn.social({
      callbackURL: toAbsoluteUrl(callbackURL),
      errorCallbackURL: toAbsoluteUrl("/login?error=google"),
      provider: "google",
    });
    if (result.error) {
      setIsSubmitting(false);
    }
  };

  return (
    <Button
      className={cn("w-full gap-2", className)}
      disabled={isSubmitting}
      onClick={handleClick}
      size="lg"
      type="button"
      variant="outline"
    >
      <GoogleIcon className="size-4" />
      {isSubmitting ? "跳转中..." : "使用 Google 账号登录"}
    </Button>
  );
}
