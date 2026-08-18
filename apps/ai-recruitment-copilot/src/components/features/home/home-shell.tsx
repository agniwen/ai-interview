"use client";

import { useNavigate } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BackgroundLayers } from "./background-layers";
import { CapabilityGrid } from "./capability-grid";
import { Faq } from "./faq";
import { FeatureBlocks } from "./feature-blocks";
import { HomeFooter } from "./footer";
import { Hero } from "./hero";
import { Personas } from "./personas";
import { ProcessTabs } from "./process-tabs";
import { ProductShot } from "./product-shot";
import { HomeSmoothScroll } from "./smooth-scroll";
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
    <>
      <BackgroundLayers />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <HomeSmoothScroll>
        <main className="relative flex w-full flex-col items-stretch" id="main-content">
          {/* Hero 区不再占满首屏，让下方 ProductShot 露出约一半（Notion 风格）
              Hero no longer fills the viewport; lets ProductShot peek up like Notion's hero. */}
          <div className="mx-auto flex w-full max-w-[96rem] flex-col items-center px-5 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
            <Hero onResumeFiltering={onResumeFiltering} onWorkbench={onWorkbench} />
          </div>
          <ProductShot />
          {/* <TrustStrip /> */}
          <FeatureBlocks />
          <CapabilityGrid />
          <Personas />
          <DecisionPrinciples />
          <ProcessTabs />
          <Faq />
          {/* <CtaSection
            isPending={isPending}
            onResumeFiltering={onResumeFiltering}
            onWorkbench={onWorkbench}
          /> */}
          <HomeFooter />
        </main>
      </HomeSmoothScroll>
    </>
  );
}
