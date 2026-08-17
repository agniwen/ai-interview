"use client";

import type { Variants } from "motion/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { env } from "@/env/client";
import { EmailPasswordSignInForm } from "./email-password-sign-in-form";
import { FeishuSignInButton } from "./feishu-sign-in-button";
import { GoogleSignInButton } from "./google-sign-in-button";

const SHOW_GOOGLE_LOGIN = env.NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN;
const PANEL_OFFSET = 20;

type SignInTab = "feishu" | "oauth" | "password";
type SlideDirection = -1 | 1;
const signInTabSchema = z.enum(["feishu", "oauth", "password"]);

interface PanelMotionContext {
  direction: SlideDirection;
  reduceMotion: boolean;
}

const panelVariants = {
  center: {
    opacity: 1,
    transform: "translateX(0px)",
  },
  enter: ({ direction, reduceMotion }: PanelMotionContext) => ({
    opacity: reduceMotion ? 1 : 0,
    transform: reduceMotion ? "translateX(0px)" : `translateX(${direction * PANEL_OFFSET}px)`,
  }),
  exit: ({ direction, reduceMotion }: PanelMotionContext) => ({
    opacity: reduceMotion ? 1 : 0,
    transform: reduceMotion ? "translateX(0px)" : `translateX(${-direction * PANEL_OFFSET}px)`,
  }),
} satisfies Variants;

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
  const defaultValue: SignInTab = SHOW_GOOGLE_LOGIN ? "oauth" : "feishu";
  const [activeTab, setActiveTab] = useState<SignInTab>(defaultValue);
  const [direction, setDirection] = useState<SlideDirection>(1);
  const reduceMotion = Boolean(useReducedMotion());
  const motionContext = { direction, reduceMotion } satisfies PanelMotionContext;

  function handleValueChange(value: string) {
    const result = signInTabSchema.safeParse(value);
    if (!result.success) {
      return;
    }
    const nextTab = result.data;
    setDirection(nextTab === "password" ? 1 : -1);
    setActiveTab(nextTab);
  }

  function renderActivePanel() {
    if (activeTab === "password") {
      return (
        <TabsContent className="mt-4" value="password">
          <EmailPasswordSignInForm callbackURL={callbackURL} />
        </TabsContent>
      );
    }
    if (SHOW_GOOGLE_LOGIN) {
      return (
        <TabsContent className="mt-4" value="oauth">
          <GoogleSignInButton callbackURL={callbackURL} />
        </TabsContent>
      );
    }
    return (
      <TabsContent className="mt-4 space-y-3" value="feishu">
        <FeishuSignInButton callbackURL={callbackURL} />
        <FeishuSignInButton
          callbackURL={callbackURL}
          label="极光 HR 飞书登录"
          providerId="feishu-jiguang-hr"
          variant="default"
        />
      </TabsContent>
    );
  }

  return (
    <Tabs className="w-full" onValueChange={handleValueChange} value={activeTab}>
      <TabsList className="grid w-full grid-cols-2">
        {SHOW_GOOGLE_LOGIN ? (
          <TabsTrigger value="oauth">Google 登录</TabsTrigger>
        ) : (
          <TabsTrigger value="feishu">飞书登录</TabsTrigger>
        )}
        <TabsTrigger value="password">账号密码登录</TabsTrigger>
      </TabsList>
      <AnimatedHeight animateOnMobile>
        <div className="relative">
          <AnimatePresence custom={motionContext} initial={false} mode="popLayout">
            <m.div
              animate="center"
              custom={motionContext}
              exit="exit"
              initial="enter"
              key={activeTab}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const }
              }
              variants={panelVariants}
            >
              {renderActivePanel()}
            </m.div>
          </AnimatePresence>
        </div>
      </AnimatedHeight>
    </Tabs>
  );
}
