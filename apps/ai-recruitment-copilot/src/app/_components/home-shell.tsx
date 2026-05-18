"use client";

import { useMemo } from "react";
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

  const callbackURL = useMemo(() => pendingPath ?? "/", [pendingPath]);
  // 客户端拿不到活跃 workspace slug，所以两条 CTA 都先走根路径，把意图通过 ?goto=
  // 透传给 src/app/page.tsx，由它在服务端解析 workspace 后分别落到 chat / studio。
  // 这套同时覆盖未登录回跳：sign-in 弹窗的 callbackURL 也是带 goto 的根路径，
  // 登录完成后 page.tsx 仍能按 goto 路由。
  // The client doesn't know the active workspace slug. Both CTAs route through
  // `/` carrying intent via `?goto=`, and src/app/page.tsx resolves the
  // workspace + redirects to chat / studio accordingly. This also survives the
  // sign-in dialog round-trip because callbackURL preserves the query string.
  const onResumeFiltering = () => navigate("/?goto=chat");
  const onWorkbench = () => navigate("/?goto=studio");

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
          pendingPath?.includes("goto=chat")
            ? "登录后即可进入简历筛选"
            : "登录后即可使用 AI Recruitment Copilot"
        }
      />
    </>
  );
}
