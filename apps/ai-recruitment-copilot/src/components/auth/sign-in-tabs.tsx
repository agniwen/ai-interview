"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailPasswordSignInForm } from "./email-password-sign-in-form";
import { FeishuSignInButton } from "./feishu-sign-in-button";
import { GoogleSignInButton } from "./google-sign-in-button";

// 通过 NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN 切换登录入口：设置后只暴露 Google OAuth，
// 隐藏飞书；未设置则沿用默认（飞书）。生产环境（国内 IDC）出口到
// oauth2.googleapis.com 不通，所以默认关闭；本地 dev 或有海外出口的部署可显式开启。
// Vite 通过 envPrefix 暴露 NEXT_PUBLIC_* 到 import.meta.env。
// Toggle login entry points via NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN: when set, only
// Google OAuth is exposed and Feishu is hidden; otherwise fall back to the
// default (Feishu). Production runs from a domestic IDC whose egress can't
// reach oauth2.googleapis.com, so it stays off by default; local dev or
// overseas-egress deployments can opt in. Vite exposes NEXT_PUBLIC_* through
// import.meta.env via envPrefix.
const SHOW_GOOGLE_LOGIN = Boolean(import.meta.env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN);

interface SignInTabsProps {
  /** 登录成功后跳转目标 / Where to navigate once signed in. */
  callbackURL: string;
}

export function SignInTabs({ callbackURL }: SignInTabsProps) {
  // Google 与飞书互斥：开启 Google 时隐藏飞书，关闭时回到飞书；密码登录始终存在。
  // 默认 tab 兜到当前可见的 OAuth/飞书 tab。
  // Google and Feishu are mutually exclusive: enabling Google hides Feishu and
  // vice versa; password sign-in is always present. The default tab falls back
  // to whichever of the two is currently visible.
  const defaultValue = SHOW_GOOGLE_LOGIN ? "oauth" : "feishu";

  return (
    <Tabs className="w-full" defaultValue={defaultValue}>
      <TabsList className="grid w-full grid-cols-2">
        {SHOW_GOOGLE_LOGIN ? (
          <TabsTrigger value="oauth">Google 登录</TabsTrigger>
        ) : (
          <TabsTrigger value="feishu">飞书登录</TabsTrigger>
        )}
        <TabsTrigger value="password">账号密码登录</TabsTrigger>
      </TabsList>
      {SHOW_GOOGLE_LOGIN ? (
        <TabsContent className="mt-4" value="oauth">
          <GoogleSignInButton callbackURL={callbackURL} />
        </TabsContent>
      ) : (
        <TabsContent className="mt-4 space-y-3" value="feishu">
          <FeishuSignInButton callbackURL={callbackURL} />
          <FeishuSignInButton
            callbackURL={callbackURL}
            label="极光 HR 飞书登录"
            providerId="feishu-jiguang-hr"
            variant="default"
          />
        </TabsContent>
      )}
      <TabsContent className="mt-4" value="password">
        <EmailPasswordSignInForm callbackURL={callbackURL} />
      </TabsContent>
    </Tabs>
  );
}
