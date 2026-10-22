"use client";

import { lazy, Suspense } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { DemoWindowSkeleton } from "./screens/demo-window-skeleton";
import { ScreenFrame } from "./screens/screen-frame";

// 演示窗口依赖整套 Studio 组件，单独分包，水合后再加载，不阻塞首屏 SSR 内容。
// The demo pulls in Studio components, so it ships as its own chunk loaded after hydration.
const ResumesScreen = lazy(async () => {
  const { ResumesScreen: Screen } = await import("./screens/resumes-screen");
  return { default: Screen };
});

/** SSR 与加载期间的同尺寸骨架窗口，结构对齐演示 UI，避免布局跳动。 Same-size skeleton window for SSR and loading. */
function DemoWindowPlaceholder() {
  return (
    <ScreenFrame>
      <DemoWindowSkeleton />
    </ScreenFrame>
  );
}

/**
 * 首屏产品舞台：透出首屏天空背景，演示窗口居中、四周留白，随断点收放留白而非放大内容。
 * Product stage over the hero sky with the demo window centered; breakpoints change the breathing room.
 */
export function ProductShot() {
  const hydrated = useHydrated();

  return (
    <section
      className="relative isolate mx-auto w-full max-w-[105rem]"
      data-slot="home-product-stage"
    >
      <div className="mx-auto w-full max-w-[calc(1280px+8rem)] px-4 pt-2 pb-12 sm:pb-14 lg:px-16 lg:pb-16">
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-[550ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none">
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
