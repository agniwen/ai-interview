"use client";

import { useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { RecruitmentCopilotMark } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { BackgroundLayers } from "./background-layers";
import { CapabilityGrid } from "./capability-grid";
import { Faq } from "./faq";
import { FeatureBlocks } from "./feature-blocks";
import { HomeFooter } from "./footer";
import { Hero } from "./hero";
import { Personas } from "./personas";
import { PageGrain } from "./page-grain";
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
      <PageGrain />
      <main className="relative flex w-full flex-col items-stretch bg-background" id="main-content">
        <div className="relative isolate overflow-hidden">
          <BackgroundLayers fadeToBackground />
          <header className="mx-auto flex w-full max-w-360 items-center justify-between gap-4 px-6 pt-6 sm:px-8 sm:pt-8 lg:px-12">
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
          <div className="mx-auto w-full max-w-360 px-6 pt-16 sm:px-8 sm:pt-20 lg:px-12 lg:pt-24">
            <Hero onResumeFiltering={onResumeFiltering} onWorkbench={onWorkbench} />
          </div>
          <ProductShot />
        </div>
        <div className="relative bg-background">
          {/* <TrustStrip /> */}
          <FeatureBlocks />
          <div className="relative isolate overflow-hidden">
            <CapabilityGrid />
            <Personas />
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
