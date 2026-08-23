"use client";

import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@arc/shared/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Spinner } from "@/components/ui/spinner";
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

function HomeBackgroundLoading({ visible }: { visible: boolean }) {
  return (
    <output
      aria-hidden={!visible}
      aria-label="首页动态背景正在加载"
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-20 flex items-center justify-center bg-background px-6 transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      data-slot="home-background-loading"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-mono font-medium text-primary uppercase tracking-[0.22em]">
          AI Recruitment Copilot
        </span>
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner />
          投递接收中，请坐和放宽。
        </span>
      </div>
    </output>
  );
}

export default function HomeShell() {
  const navigate = useNavigate();
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  const onBackgroundReadyChange = useCallback((ready: boolean) => {
    setBackgroundReady(ready);
    if (ready) {
      setHasEntered(true);
    }
  }, []);

  // 首页只对未登录用户可见。两条 CTA 先进入独立登录页，并通过 goto 保留入口意图；
  // 登录完成后 /login 会回到根路由，由根路由在拿到活跃 workspace 后解析最终落点。
  // The homepage is only visible to signed-out users. Both CTAs enter the
  // dedicated login page with their intent in goto; after sign-in, the root
  // route resolves the active workspace and final destination.
  const onResumeFiltering = () => navigate({ search: { goto: "agent" }, to: "/login" });
  const onWorkbench = () => navigate({ search: { goto: "studio" }, to: "/login" });

  return (
    <div aria-busy={!backgroundReady} className={cn(!backgroundReady && "h-dvh overflow-hidden")}>
      <HomeBackgroundLoading visible={!backgroundReady} />
      {hasEntered ? (
        <div className="fixed top-4 right-4 z-10">
          <ThemeToggle />
        </div>
      ) : null}

      <HomeSmoothScroll>
        <main
          className="relative flex w-full flex-col items-stretch bg-background"
          id="main-content"
        >
          <div className="relative isolate overflow-hidden">
            <BackgroundLayers fadeToBackground onVideoReadyChange={onBackgroundReadyChange} video />
            {hasEntered ? (
              <>
                {/* Hero 区不再占满首屏，让下方 ProductShot 露出约一半（Notion 风格）
                    Hero no longer fills the viewport; lets ProductShot peek up like Notion's hero. */}
                <div className="mx-auto flex w-full max-w-[96rem] flex-col items-center px-5 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
                  <Hero onResumeFiltering={onResumeFiltering} onWorkbench={onWorkbench} />
                </div>
                <ProductShot />
              </>
            ) : (
              <div className="h-screen" />
            )}
          </div>
          {hasEntered ? (
            <div className="relative bg-background">
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
            </div>
          ) : null}
        </main>
      </HomeSmoothScroll>
    </div>
  );
}
