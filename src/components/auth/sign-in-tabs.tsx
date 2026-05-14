"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailPasswordSignInForm } from "./email-password-sign-in-form";
import { FeishuSignInButton } from "./feishu-sign-in-button";
import { GoogleSignInButton } from "./google-sign-in-button";

// 生产环境（国内 IDC）出口到 oauth2.googleapis.com 不通，token exchange 必超时。
// 在没有可用代理 / 海外节点之前，把 Google OAuth 入口仅在本地 dev 暴露。
// process.env.NODE_ENV 在 Next.js 客户端组件里是构建时内联值，安全可用。
// Production runs from a domestic IDC whose egress can't reach
// oauth2.googleapis.com — the OAuth token exchange always times out. Until
// there's a working proxy / overseas node, expose the Google entry in dev only.
// NODE_ENV is inlined at build time by Next.js so it's safe in a client file.
const SHOW_OAUTH_TAB = process.env.NODE_ENV === "development";

interface SignInTabsProps {
  /** 登录成功后跳转目标 / Where to navigate once signed in. */
  callbackURL: string;
}

export function SignInTabs({ callbackURL }: SignInTabsProps) {
  // tab 数量随 OAuth 开关变化，grid-cols 跟着走；默认值兜到留下来的第一个 tab。
  // Column count tracks the visible tab set; default value falls back to the
  // first remaining tab when OAuth is hidden.
  const gridColsClass = SHOW_OAUTH_TAB ? "grid-cols-3" : "grid-cols-2";
  const defaultValue = SHOW_OAUTH_TAB ? "oauth" : "feishu";

  return (
    <Tabs className="w-full" defaultValue={defaultValue}>
      <TabsList className={`grid w-full ${gridColsClass}`}>
        {SHOW_OAUTH_TAB ? <TabsTrigger value="oauth">OAuth 登录</TabsTrigger> : null}
        <TabsTrigger value="feishu">飞书登录</TabsTrigger>
        <TabsTrigger value="password">账号密码登录</TabsTrigger>
      </TabsList>
      {SHOW_OAUTH_TAB ? (
        <TabsContent className="mt-4" value="oauth">
          <GoogleSignInButton callbackURL={callbackURL} />
        </TabsContent>
      ) : null}
      <TabsContent className="mt-4 space-y-3" value="feishu">
        <FeishuSignInButton callbackURL={callbackURL} />
        <FeishuSignInButton
          callbackURL={callbackURL}
          label="极光 HR 飞书登录"
          providerId="feishu-jiguang-hr"
          variant="default"
        />
      </TabsContent>
      <TabsContent className="mt-4" value="password">
        <EmailPasswordSignInForm callbackURL={callbackURL} />
      </TabsContent>
    </Tabs>
  );
}
