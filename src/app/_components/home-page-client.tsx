// 用途：首页组合根，编排所有分区
// Purpose: Homepage composition root that orchestrates all sections.
"use client";

import { useMemo } from "react";
import { SignInRequiredDialog } from "@/components/auth/sign-in-required-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BackgroundLayers } from "./home/background-layers";
import { CapabilityGrid } from "./home/capability-grid";
import { CtaSection } from "./home/cta-section";
import { Faq } from "./home/faq";
import { FeatureBlocks } from "./home/feature-blocks";
import { HomeFooter } from "./home/footer";
import { Hero } from "./home/hero";
import { Personas } from "./home/personas";
import { ProcessTabs } from "./home/process-tabs";
import { ProductShot } from "./home/product-shot";
import { TrustStrip } from "./home/trust-strip";
import { useProtectedNavigation } from "./home/use-protected-navigation";

export default function HomePageClient() {
  const { isPending, navigate, pendingPath, setPendingPath } = useProtectedNavigation();

  const callbackURL = useMemo(() => pendingPath ?? "/chat", [pendingPath]);
  const onResumeFiltering = () => navigate("/chat");
  const onWorkbench = () => navigate("/studio/interviews");

  return (
    <>
      <BackgroundLayers />

      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <ScrollArea className="fixed inset-0">
        <main className="relative flex w-full flex-col items-stretch" id="main-content">
          {/* Hero 区不再占满首屏，让下方 ProductShot 露出约一半（Notion 风格）
              Hero no longer fills the viewport; lets ProductShot peek up like Notion's hero. */}
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
            <Hero
              isPending={isPending}
              onResumeFiltering={onResumeFiltering}
              onWorkbench={onWorkbench}
            />
          </div>
          <ProductShot />
          <TrustStrip />
          <FeatureBlocks />
          <CapabilityGrid />
          <Personas />
          <ProcessTabs />
          <Faq />
          <CtaSection
            isPending={isPending}
            onResumeFiltering={onResumeFiltering}
            onWorkbench={onWorkbench}
          />
          <HomeFooter />
        </main>
      </ScrollArea>

      <SignInRequiredDialog
        callbackURL={callbackURL}
        onOpenChange={(open) => !open && setPendingPath(null)}
        open={pendingPath !== null}
        title={
          pendingPath === "/studio/interviews"
            ? "登录后即可进入模拟面试工作台"
            : "登录后即可进入简历筛选"
        }
      />
    </>
  );
}
