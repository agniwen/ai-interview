"use client";

import { useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { RecruitmentCopilotMark } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { SkyBackdrop } from "@/components/features/sky/sky-backdrop";
import { CapabilityGrid } from "./capability-grid";
import { Faq } from "./faq";
import { FeatureBlocks } from "./feature-blocks";
import { HomeFooter } from "./footer";
import { Hero } from "./hero";
import { ProcessTabs } from "./process-tabs";
import { ProductShot } from "./product-shot";
import { DecisionPrinciples } from "./testimonials";

export default function HomeShell() {
  const navigate = useNavigate();

  // 首页只对未登录用户可见。两条 CTA 先进入独立登录页，并通过 goto 保留入口意图；
  // 登录完成后 /login 会回到根路由，由根路由在拿到活跃 workspace 后解析最终落点。
  // The homepage is only visible to signed-out users. Both CTAs enter the
  // dedicated login page with their intent in goto; after sign-in, the root
  // route resolves the active workspace and final destination.
  const onResumeFiltering = () => navigate({ search: { goto: "agent" }, to: "/login" });
  const onWorkbench = () => navigate({ search: { goto: "studio" }, to: "/login" });

  return (
    <div>
      <main
        className="relative flex w-full flex-col items-stretch bg-home-surface"
        id="main-content"
      >
        {/* 首屏整块铺天空背景：导航、文案与演示窗口舞台共用一片流动天空。
            The whole hero (nav, copy, demo stage) shares one flowing sky. */}
        <div className="relative isolate">
          <SkyBackdrop veil />
          <header className="mx-auto flex w-full max-w-[105rem] items-center justify-between gap-4 px-6 pt-6 sm:px-8 lg:px-16 3xl:px-0">
            <div className="flex items-center gap-2.5 text-foreground">
              <RecruitmentCopilotMark className="size-7 sm:size-8" />
              <span className="font-medium text-sm tracking-tight sm:text-base">
                AI Hiring Copilot
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          <div className="mx-auto w-full max-w-[105rem] px-6 sm:px-8 lg:px-16 3xl:px-0 pt-14 pb-8 sm:pt-20 sm:pb-10 lg:pt-20 lg:pb-10 2xl:pt-28 2xl:pb-12">
            <Hero onResumeFiltering={onResumeFiltering} onWorkbench={onWorkbench} />
          </div>
          <ProductShot />
        </div>
        <div className="relative">
          <FeatureBlocks />
          {/* 能力区落在画布带（系统侧栏底色）上，白色卡片与上下正文区形成层次。
              Capability band sits on the canvas (app sidebar tone) so white cards read as a layer. */}
          <div className="relative isolate overflow-hidden bg-home-canvas">
            <CapabilityGrid />
          </div>
          <DecisionPrinciples />
          <ProcessTabs />
          <Faq />
          {/* <CtaSection
                isPending={isPending}
                onResumeFiltering={onResumeFiltering}
                onWorkbench={onWorkbench}
              /> */}
          <HomeFooter />
        </div>
      </main>
    </div>
  );
}
