"use client";

import { lazy, Suspense } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { StageArtwork } from "./stage-artwork";
import { ScreenFrame } from "./screens/screen-frame";

// 演示窗口依赖整套 Studio 组件，单独分包，水合后再加载，不阻塞首屏 SSR 内容。
// The demo pulls in Studio components, so it ships as its own chunk loaded after hydration.
const ResumesScreen = lazy(async () => {
  const { ResumesScreen: Screen } = await import("./screens/resumes-screen");
  return { default: Screen };
});

/** SSR 与加载期间的同尺寸空窗口，避免布局跳动。 Same-size empty window for SSR and loading. */
function DemoWindowPlaceholder() {
  return (
    <ScreenFrame>
      <div className="size-full bg-background" data-slot="home-demo-placeholder" />
    </ScreenFrame>
  );
}

/**
 * 首屏产品舞台：SVG 品牌背景作为舞台，演示窗口居中、四周留白，随断点收放留白而非放大内容。
 * Brand stage with the demo window centered; breakpoints change the breathing room.
 */
export function ProductShot() {
  const hydrated = useHydrated();

  return (
    // 舞台跟随 1680 首屏容器：超宽屏两侧露出页面底色，而不是无限通栏。
    // The stage follows the 1680px hero container, so ultra-wide screens show page canvas at the sides.
    <section
      className="relative isolate mx-auto w-full max-w-[105rem] overflow-hidden"
      data-slot="home-product-stage"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <StageArtwork />
      </div>
      <div className="mx-auto w-full max-w-[calc(1280px+8rem)] px-4 py-6 sm:py-12 lg:px-16 lg:py-[4.5rem]">
        <div className="w-full drop-shadow-[0_24px_48px_rgba(15,23,42,0.18)] animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-[550ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none dark:drop-shadow-[0_24px_48px_rgba(0,0,0,0.45)]">
          {hydrated ? (
            <Suspense fallback={<DemoWindowPlaceholder />}>
              <ResumesScreen />
            </Suspense>
          ) : (
            <DemoWindowPlaceholder />
          )}
        </div>
      </div>
    </section>
  );
}
