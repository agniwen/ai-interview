"use client";

import { useMemo } from "react";
import { AsciiHero } from "@/components/react-bits/ascii-hero";
import { SignInRequiredDialog } from "@/components/auth/sign-in-required-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { BackgroundLayers } from "./home/background-layers";
import { CapabilityGrid } from "./home/capability-grid";
import { Faq } from "./home/faq";
import { FeatureBlocks } from "./home/feature-blocks";
import { HomeFooter } from "./home/footer";
import { Hero } from "./home/hero";
import { Personas } from "./home/personas";
import { ProcessTabs } from "./home/process-tabs";
import { ProductShot } from "./home/product-shot";
import { HomeSmoothScroll } from "./home/smooth-scroll";
import { Testimonials } from "./home/testimonials";
import { TrustStrip } from "./home/trust-strip";
import { useProtectedNavigation } from "./home/use-protected-navigation";

export default function HomeShell() {
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

      <HomeSmoothScroll>
        <main className="relative flex w-full flex-col items-stretch" id="main-content">
          {/* Hero 区不再占满首屏，让下方 ProductShot 露出约一半（Notion 风格）
              Hero no longer fills the viewport; lets ProductShot peek up like Notion's hero. */}
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 pt-16 sm:px-8 sm:pt-20 lg:pt-24">
            <div className="relative">
              <AsciiHero />
              <Hero
                isPending={isPending}
                onResumeFiltering={onResumeFiltering}
                onWorkbench={onWorkbench}
              />
            </div>
          </div>
          <ProductShot />
          <TrustStrip />
          <FeatureBlocks />
          <CapabilityGrid />
          <Personas />
          <Testimonials />
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
