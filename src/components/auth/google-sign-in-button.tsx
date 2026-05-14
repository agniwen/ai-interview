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
// 到 localhost。优先用 NEXT_PUBLIC_APP_URL，无 window 时（不会发生在客户端组件，
// 留 fallback 仅为类型安全）才退回相对路径。
// In production callbackURL must be absolute so better-auth doesn't resolve it
// against a wrong base host (e.g. the server's localhost fallback) and ship the
// user back to localhost after Google OAuth. Prefer NEXT_PUBLIC_APP_URL; fall
// back to window.location.origin for the rare case the env var is unset.
function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function GoogleSignInButton({ callbackURL, className }: GoogleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClick = async () => {
    setIsSubmitting(true);
    const absoluteCallback = toAbsoluteUrl(callbackURL);
    const absoluteErrorCallback = toAbsoluteUrl("/login?error=google");
    // 把客户端解析出的关键 URL 打到浏览器 console，遇到生产 login 异常时让用户截 console
    // 就能立刻看出 callbackURL host 是不是错的（最常见的问题是 NEXT_PUBLIC_APP_URL 漏配
    // 导致 fallback 到 window.location.origin 或更糟）。
    // Surface the resolved URLs in the browser console; if production login
    // fails the user can screenshot the console to instantly verify whether
    // callbackURL host matches the deployed domain (top cause: missing
    // NEXT_PUBLIC_APP_URL, falling back to window.location.origin).
    console.log("[google-signin:start]", {
      absoluteCallback,
      absoluteErrorCallback,
      currentOrigin: typeof window === "undefined" ? null : window.location.origin,
      inputCallbackURL: callbackURL,
      // 注意 NEXT_PUBLIC_* 在客户端是构建时内联的——如果这里是 undefined 说明
      // 构建镜像没拿到这个环境变量。
      // NEXT_PUBLIC_* values are inlined at build time; `undefined` here means
      // the build image didn't receive the env var.
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    });
    try {
      const result = await authClient.signIn.social({
        callbackURL: absoluteCallback,
        errorCallbackURL: absoluteErrorCallback,
        provider: "google",
      });
      if (result.error) {
        console.error("[google-signin:error]", {
          // result.error 通常是 { status, statusText, message, code } 形态；
          // 整个对象打出来便于一眼看出是 400 (bad request) 还是 401/500。
          // result.error is usually { status, statusText, message, code };
          // dumping the whole object distinguishes 400-class from 5xx.
          error: result.error,
        });
        setIsSubmitting(false);
      } else {
        console.log("[google-signin:ok]", { data: result.data });
      }
    } catch (error) {
      console.error("[google-signin:throw]", error);
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
