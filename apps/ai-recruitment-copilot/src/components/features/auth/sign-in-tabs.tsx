"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { env } from "@/env/client";
import { EmailPasswordSignInForm } from "./email-password-sign-in-form";
import { FeishuSignInButton } from "./feishu-sign-in-button";
import { GoogleSignInButton } from "./google-sign-in-button";

const SHOW_GOOGLE_LOGIN = env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;

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
