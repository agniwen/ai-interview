// 用途：首页组合根，编排所有分区
// Purpose: Homepage composition root that orchestrates all sections.
"use client";

import { useMemo } from "react";
import { SignInRequiredDialog } from "@/components/auth/sign-in-required-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BackgroundLayers } from "./home/background-layers";
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
          <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center px-5 py-16 sm:px-8 sm:py-20 lg:py-24">
            <Hero
              isPending={isPending}
              onResumeFiltering={onResumeFiltering}
              onWorkbench={onWorkbench}
            />
            <TrustStrip />
          </div>
          <ProductShot />
          <FeatureBlocks />
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
