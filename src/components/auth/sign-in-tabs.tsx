"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailPasswordSignInForm } from "./email-password-sign-in-form";
import { FeishuSignInButton } from "./feishu-sign-in-button";
import { GoogleSignInButton } from "./google-sign-in-button";

interface SignInTabsProps {
  /** 登录成功后跳转目标 / Where to navigate once signed in. */
  callbackURL: string;
}

export function SignInTabs({ callbackURL }: SignInTabsProps) {
  return (
    <Tabs className="w-full" defaultValue="oauth">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="oauth">OAuth 登录</TabsTrigger>
        <TabsTrigger value="feishu">飞书登录</TabsTrigger>
        <TabsTrigger value="password">账号密码登录</TabsTrigger>
      </TabsList>
      <TabsContent className="mt-4" value="oauth">
        <GoogleSignInButton callbackURL={callbackURL} />
      </TabsContent>
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
