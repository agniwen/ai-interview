"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/env/client";
import { authClient } from "@/lib/client/auth-client";
import { cn } from "@arc/shared/utils";
import { GoogleIcon } from "./google-icon";

interface GoogleSignInButtonProps {
  callbackURL: string;
  className?: string;
}

// 生产环境必须把 callbackURL 拼成绝对 URL，否则 better-auth 在做 Google OAuth 跳转
// 时会把它落到错误的 host。NEXT_PUBLIC_BASE_URL 由 client env 显式校验。
// In production callbackURL must be absolute so better-auth does not resolve it
// against the wrong base host. NEXT_PUBLIC_BASE_URL is validated by client env.
function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = env.NEXT_PUBLIC_BASE_URL;
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
