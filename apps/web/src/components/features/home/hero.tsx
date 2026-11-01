"use client";

import { IconArrowUpRight } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import * as messages from "@/paraglide/messages";
import { LeadText } from "./section";

interface HeroProps {
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

// 入场动画用 CSS（tw-animate-css），SSR 文本无需等水合即可显示。CSS 动画在节点重插（body 上的
// OverlayScrollbars 初始化）或样式表替换（开发环境的样式注入）时会从头重播，表现为首屏“跳一下”。
// 因此入场只播一次：播完（或水合时已播完）就给首屏标记 data-entered，此后关闭动画；
// OverlayScrollbars 在 html 上的标记作为同一保护的兜底。
// CSS entrances keep SSR text visible before hydration, but CSS animations replay when nodes are
// re-inserted (body OverlayScrollbars init) or stylesheets are swapped (dev style injection), which
// shows as a jump. They play once: after they finish (or if already finished at hydration) the hero
// is marked data-entered and animation is switched off; the OverlayScrollbars html mark is a fallback.
const ENTER =
  "animate-in fade-in fill-mode-both duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none in-data-entered:animate-none in-data-overlayscrollbars:animate-none";

/** 首屏入场动画全部结束（含水合前已结束）后返回 true。 True once every hero entrance has finished. */
function useEntranceFinished() {
  const rootRef = useRef<HTMLElement>(null);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    let active = true;
    // jsdom 等环境没有 getAnimations。 Some environments (e.g. jsdom) lack getAnimations.
    const animations = "getAnimations" in root ? root.getAnimations({ subtree: true }) : [];
    async function markWhenFinished() {
      await Promise.allSettled(animations.map((animation) => animation.finished));
      if (active) {
        setFinished(true);
      }
    }
    void markWhenFinished();
    return () => {
      active = false;
    };
  }, []);
  return { finished, rootRef };
}

export function Hero({ onResumeFiltering, onWorkbench }: HeroProps) {
  const { finished, rootRef } = useEntranceFinished();
  return (
    // 居中排版：两行粗体大标题、居中说明段、加大的胶囊按钮，对标 shaders.com 官方示例。
    // Centered layout: bold two-line headline, centered lead and large pill CTAs.
    <section
      className="relative flex w-full flex-col items-center text-center"
      data-entered={finished ? "" : undefined}
      ref={rootRef}
    >
      <h1
        className={`${ENTER} slide-in-from-bottom-[18px] font-semibold text-[clamp(2.25rem,4.6vw,4.75rem)] text-foreground leading-[1.22] tracking-[-0.045em] [text-wrap:balance] dark:text-white`}
      >
        <span className="block">Hireseer</span>
        <span className="block">{messages.home_hero_tagline()}</span>
      </h1>

      <div className={`${ENTER} slide-in-from-bottom-3 mt-5 delay-[120ms] sm:mt-6 2xl:mt-8`}>
        <LeadText className="mx-auto max-w-[34rem] text-base text-foreground/70 leading-[1.75] sm:text-base lg:text-base xl:text-base 2xl:text-lg dark:text-white/75">
          {messages.home_hero_description()}
        </LeadText>
      </div>

      {/* 两个按钮等宽且随文案伸缩：sm 起并排取较长者宽度，窄屏纵向铺满，避免外文溢出。
          Equal-width CTAs sized by the longer label; stacked full-width on narrow screens. */}
      <div
        className={`${ENTER} slide-in-from-bottom-3 delay-[180ms] mt-8 grid w-full max-w-xs grid-cols-1 gap-3 sm:w-auto sm:max-w-none sm:grid-flow-col sm:grid-cols-none sm:auto-cols-fr 2xl:mt-10`}
      >
        <Button
          className="group h-11 min-w-40 gap-2 rounded-full border-transparent bg-foreground px-6 font-medium text-background text-[15px] shadow-none inset-shadow-none hover:bg-foreground/90 has-[>svg]:px-6 active:inset-shadow-none dark:bg-white dark:text-[#071233] dark:hover:bg-white/90"
          onClick={onResumeFiltering}
          type="button"
        >
          {messages.home_hero_resume_cta()}
          <IconArrowUpRight
            aria-hidden="true"
            data-icon="inline-end"
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
          />
        </Button>
        <Button
          className="h-11 min-w-40 rounded-full border-white/70 bg-white/55 px-6 font-medium text-[15px] shadow-none backdrop-blur-md hover:bg-white/75 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/15"
          onClick={onWorkbench}
          type="button"
          variant="outline"
        >
          {messages.home_hero_workbench_cta()}
        </Button>
      </div>
    </section>
  );
}
