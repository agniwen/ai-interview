"use client";

// 首页平滑滚动容器 / Homepage smooth-scroll wrapper
//
// 用 GSAP `ScrollSmoother` 接管 window 滚动，给整个首页加 inertia/lerp 平滑效果。
// 关键约束：
//   1. 必须保留 `id="smooth-wrapper"` 和 `id="smooth-content"` 两层 div，是 ScrollSmoother 的硬性要求
//   2. ScrollSmoother 会把 #smooth-wrapper 设为 fixed inset-0，#smooth-content 用 transform 上移来"假装"滚动
//      —— 真实页面高度由 #smooth-content 决定，html/body 仍是无滚动状态
//   3. 创建后必须 `ScrollTrigger.refresh()`，让已经 mount 的子组件 (product-shot / feature-blocks)
//      重新计算 trigger 边界，否则它们的 ScrollTrigger 会按 window 旧坐标算
//   4. 尊重 `prefers-reduced-motion`：用户禁用动效时不开 smoother，回退到原生滚动
//
// Uses GSAP `ScrollSmoother` to intercept window scroll and add inertia.
// Hard requirements:
//   1. Keep the `id="smooth-wrapper"` / `id="smooth-content"` div pair — required by the plugin.
//   2. ScrollSmoother fixes the wrapper at inset-0 and translates the content to fake scroll.
//   3. Call `ScrollTrigger.refresh()` after creation so already-mounted children resync.
//   4. Respect `prefers-reduced-motion` — fall back to native scroll when set.

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { ReactNode } from "react";
import { useRef } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);

export function HomeSmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (typeof window === "undefined") {
        return;
      }
      // reduced-motion 时直接退出，让浏览器原生滚动接管
      // Bail out for reduced-motion users — keep native scrolling.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const smoother = ScrollSmoother.create({
        content: "#smooth-content",
        // 启用基于滚动方向的 effects（data-speed / data-lag 暂未使用，留接口）。
        // Enable speed/lag effects (we don't use data-speed yet but keep the option open).
        effects: true,
        // 内容滚动 lerp 时长（秒），数值越大越"飘"；1 是 GSAP demo 推荐值。
        // Scroll lerp duration in seconds — higher = floatier. 1 matches GSAP's demo.
        smooth: 1,
        // 让原生 anchor 点击也走 smoother，体验统一。
        // Route native anchor clicks through smoother for consistent feel.
        smoothTouch: 0.1,
        wrapper: "#smooth-wrapper",
      });

      // 先于本组件 mount 的 ScrollTrigger（product-shot / feature-blocks 的 useLayoutEffect
      // 比父组件早跑）需要 refresh，重新按 smoother 的虚拟滚动坐标计算 start/end。
      // Existing ScrollTriggers from children already mounted (their useLayoutEffect runs
      // before this parent's) need a refresh so their start/end get recomputed against
      // the smoother's virtual scroll axis.
      ScrollTrigger.refresh();

      return () => {
        smoother.kill();
      };
    },
    { scope: wrapperRef },
  );

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content">{children}</div>
    </div>
  );
}
