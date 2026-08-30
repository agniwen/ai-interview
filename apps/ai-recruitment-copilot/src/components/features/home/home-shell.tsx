"use client";

import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@arc/shared/utils";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { Spinner } from "@/components/ui/spinner";
import * as m from "@/paraglide/messages";
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
      aria-label={m.home_loading_aria()}
      aria-live="polite"
      className={cn(
        "fixed inset-0 z-20 flex items-center justify-center bg-background px-6 transition-opacity duration-300",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      data-slot="home-background-loading"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-mono font-medium text-primary uppercase tracking-[0.22em]">
          AI Hiring Copilot
        </span>
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner />
          {m.home_loading_message()}
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
        <div className="fixed top-4 right-4 z-10 flex items-center gap-1">
          <LanguageToggle />
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
              <div className="relative isolate overflow-hidden">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-16 -right-20 -z-10 h-24 w-72 -rotate-6 bg-[url('/landing/decor/brush-sage-sweep.png')] bg-center bg-contain bg-no-repeat opacity-40 select-none sm:top-20 sm:-right-12 sm:h-32 sm:w-96 sm:opacity-50 lg:right-0 lg:h-36 lg:w-[28rem] dark:bg-[url('/landing/decor/brush-sage-sweep-dark.png')] dark:opacity-55"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[27%] -right-32 -z-10 h-28 w-96 rotate-2 bg-[url('/landing/decor/brush-sage-broad.png')] bg-center bg-contain bg-no-repeat opacity-[0.14] select-none sm:-right-24 sm:h-36 sm:w-[30rem] sm:opacity-[0.18] lg:-right-16 lg:h-44 lg:w-[36rem] lg:opacity-20 dark:bg-[url('/landing/decor/brush-sage-broad-dark.png')] dark:opacity-40"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[46%] -left-16 -z-10 hidden h-20 w-72 -rotate-3 bg-[url('/landing/decor/brush-earth-dry.png')] bg-center bg-contain bg-no-repeat opacity-40 select-none sm:block sm:w-80 sm:opacity-45 lg:-left-8 lg:h-24 lg:w-96 lg:opacity-50 dark:bg-[url('/landing/decor/brush-earth-dry-dark.png')] dark:opacity-45"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 bottom-4 -z-10 h-24 w-40 rotate-6 bg-[url('/landing/decor/brush-stone-flicks.png')] bg-center bg-contain bg-no-repeat opacity-25 select-none sm:right-[5%] sm:bottom-8 sm:h-28 sm:w-48 sm:opacity-30 lg:h-32 lg:w-56 lg:opacity-35 dark:bg-[url('/landing/decor/brush-stone-flicks-dark.png')] dark:opacity-40"
                />
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
          ) : null}
        </main>
      </HomeSmoothScroll>
    </div>
  );
}
