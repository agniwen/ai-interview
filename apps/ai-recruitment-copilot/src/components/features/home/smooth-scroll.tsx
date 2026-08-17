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

export interface HomeSmoothScrollDependencies {
  createSmoother: (options: Parameters<typeof ScrollSmoother.create>[0]) => { kill: () => void };
  getWindow: () => Window | undefined;
  refreshTriggers: () => void;
}

const defaultHomeSmoothScrollDependencies: HomeSmoothScrollDependencies = {
  createSmoother: ScrollSmoother.create,
  getWindow: () => globalThis.window,
  refreshTriggers: ScrollTrigger.refresh,
};

export function HomeSmoothScroll({
  children,
  dependencies = defaultHomeSmoothScrollDependencies,
}: {
  children: ReactNode;
  dependencies?: HomeSmoothScrollDependencies;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 注意：不要给 useGSAP 传 `{ scope: wrapperRef }`。scope 会把所有选择器字符串
  // 改写成 `wrapperRef.current.querySelector(...)`，但 wrapperRef.current 本身就是
  // #smooth-wrapper，导致 `wrapper: "#smooth-wrapper"` 在自身内部查找而返回 null，
  // ScrollSmoother 静默失败。直接传 DOM 元素 ref 最稳。
  // Do NOT pass `{ scope: wrapperRef }` to useGSAP — scope rewrites selector strings
  // to `wrapperRef.current.querySelector(...)`, and since wrapperRef IS #smooth-wrapper
  // the lookup returns null and ScrollSmoother silently fails to initialize.
  // Pass DOM nodes directly instead of selector strings.
  useGSAP(() => {
    gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);
    const browserWindow = dependencies.getWindow();
    if (!browserWindow) {
      return;
    }

    // 首页是独立的营销落地页，不恢复上一次浏览位置。TanStack Router 的全局滚动
    // 恢复可能在 GSAP 创建 pin spacer 前把页面放到旧坐标，导致三幕绝对定位内容在
    // 初始化窗口内重叠。先归零，再让 ScrollSmoother/ScrollTrigger 测量最终布局。
    // The homepage is a standalone landing page, so don't restore a previous position.
    // Router restoration can otherwise move to a stale offset before GSAP creates its pin
    // spacer, briefly stacking the absolutely-positioned scenes during initialization.
    browserWindow.scrollTo(0, 0);

    // reduced-motion 时直接退出，让浏览器原生滚动接管
    // Bail out for reduced-motion users — keep native scrolling.
    if (browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (!(wrapperRef.current && contentRef.current)) {
      return;
    }

    const smoother = dependencies.createSmoother({
      content: contentRef.current,
      // 启用基于滚动方向的 effects（data-speed / data-lag 暂未使用，留接口）。
      // Enable speed/lag effects (we don't use data-speed yet but keep the option open).
      effects: true,
      // 阻止 smoother 把 #smooth-content 之外的焦点元素卷进视口。
      // 触发场景：Radix 把 DropdownMenu / Popover / Dialog 的内容 portal 到 <body>，
      // 焦点先飞到 menu item，但 Popper 还没把它定到正确位置 —— smoother 读到的
      // boundingRect 在视口外，于是自动 scroll 过去，视觉上就是页面"往上跳一段"。
      // 同理覆盖右上角 fixed 定位的 ThemeToggle 按钮（也不在 smooth-content 里）。
      // Prevent smoother from scroll-into-view'ing focus targets outside
      // #smooth-content. Trigger: Radix portals DropdownMenu / Popover / Dialog
      // content into <body>; focus moves to a menu item before Popper places it,
      // smoother reads an off-viewport rect and scrolls toward it — looks like a
      // jump up. Same fix covers the fixed-position ThemeToggle in the corner.
      onFocusIn: () => {
        const target = document.activeElement;
        if (target && contentRef.current && !contentRef.current.contains(target)) {
          return false;
        }
      },
      // 内容滚动 lerp 时长（秒），数值越大越"飘"；1 是 GSAP demo 推荐值。
      // Scroll lerp duration in seconds — higher = floatier. 1 matches GSAP's demo.
      smooth: 1,
      // 让原生 anchor 点击也走 smoother，体验统一。
      // Route native anchor clicks through smoother for consistent feel.
      smoothTouch: 0.1,
      wrapper: wrapperRef.current,
    });

    // 先于本组件 mount 的 ScrollTrigger（product-shot / feature-blocks 的 useLayoutEffect
    // 比父组件早跑）需要 refresh，重新按 smoother 的虚拟滚动坐标计算 start/end。
    // Existing ScrollTriggers from children already mounted (their useLayoutEffect runs
    // before this parent's) need a refresh so their start/end get recomputed against
    // the smoother's virtual scroll axis.
    dependencies.refreshTriggers();

    return () => {
      smoother.kill();
      // 兜底还原 html/body 的 overflow，避免 GSAP 残留导致离开首页后页面无法滚动。
      // Defensive reset — clear any inline overflow GSAP may have left behind so
      // subsequent routes (e.g. OverlayScrollbars) can scroll normally.
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [dependencies]);

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
