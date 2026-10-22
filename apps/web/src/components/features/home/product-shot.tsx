"use client";

import { lazy, Suspense } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { DemoWindowSkeleton } from "./screens/demo-window-skeleton";
import { ScreenFrame } from "./screens/screen-frame";

// 演示窗口依赖整套 Studio 组件，单独分包。客户端在模块加载时就开始拉取，和水合并行，水合后立即挂载。
// The demo pulls in Studio components, so it ships as its own chunk. The client starts fetching it as
// soon as this module loads, in parallel with hydration, and mounts it right after hydration.
const loadResumesScreen = () => import("./screens/resumes-screen");
if (!import.meta.env.SSR) {
  void loadResumesScreen();
}

const ResumesScreen = lazy(async () => {
  const { ResumesScreen: Screen } = await loadResumesScreen();
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
        {hydrated ? (
          <Suspense fallback={<DemoWindowPlaceholder />}>
            <ResumesScreen />
          </Suspense>
        ) : (
          <DemoWindowPlaceholder />
        )}
      </div>
    </section>
  );
}
