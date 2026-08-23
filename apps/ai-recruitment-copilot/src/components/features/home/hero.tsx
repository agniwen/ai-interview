"use client";

import { IconArrowRight, IconSparkles } from "@tabler/icons-react";
// 用途：首页 Hero 区，保留原有视觉与 CTA
// Purpose: Hero section preserving original visuals + CTAs.
import { m, useReducedMotion } from "motion/react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { SplitText } from "@/components/react-bits/split-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as messages from "@/paraglide/messages";

interface HeroProps {
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

// 入场动画时间轴（与外层 FadeContent 协调）/ Entrance timeline (coordinated with FadeContent siblings):
//   t=0      eyebrow badge fade
//   t=0.15   ⬅︎ 品牌行（本组件管控）/ brand mark
//   t=0.10   tagline 首字符 stagger 起点（SplitText 内部 delayChildren）
//   t=0.10   sub paragraph fade
//   t=0.20   CTA buttons fade
const BRAND_MARK_CLASS =
  "mb-3 block font-mono font-medium text-base text-primary uppercase tracking-[0.22em] dark:text-chart-4 sm:mb-4 sm:text-base lg:text-lg";

export function Hero({ onResumeFiltering, onWorkbench }: HeroProps) {
  const reducedMotion = useReducedMotion();

  return (
    <section className="relative w-full text-center">
      <FadeContent>
        {/* 中文官方名放在标语徽章里，承担本地化品牌识别。
            Chinese official name lives in the eyebrow badge for localized brand recall. */}
        <Badge className="dark:border-primary/45! dark:bg-primary/25! dark:text-chart-4!">
          <IconSparkles aria-hidden="true" data-icon="inline-start" />
          {messages.home_hero_eyebrow()}
        </Badge>
      </FadeContent>

      <h1 className="mt-5 mx-auto max-w-5xl text-balance font-medium text-[2rem] text-foreground leading-[1.12] tracking-tight dark:text-white sm:mt-6 sm:text-5xl lg:text-[3.5rem]">
        {/* 品牌行用 motion.span（不能用 FadeContent，它会渲染 <div> 嵌进 <h1> 不合法）。
            延迟 0.15s 卡在 eyebrow 起势之后、SplitText 标语字符 stagger 起点(0.1s) 附近，
            形成 eyebrow → 品牌行 → 标语字符 → 副标题 → CTA 的连贯入场。
            Use motion.span instead of FadeContent — FadeContent renders a <div>, which is
            invalid inside <h1>. Delay 0.15s slots between the eyebrow's lift-off and the
            SplitText character stagger (which starts at 0.1s). */}
        {reducedMotion ? (
          <span className={BRAND_MARK_CLASS}>AI Recruitment Copilot</span>
        ) : (
          <m.span
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            className={BRAND_MARK_CLASS}
            initial={{ opacity: 0, transform: "translateY(12px)" }}
            transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
          >
            AI Recruitment Copilot
          </m.span>
        )}
        <SplitText text={messages.home_hero_tagline()} />
      </h1>

      <FadeContent className="mt-5 mx-auto max-w-2xl sm:mt-7" delay={0.1}>
        <p className="font-serif text-sm text-muted-foreground leading-normal dark:text-white/80 sm:text-lg sm:leading-[1.8]">
          {messages.home_hero_description()}
        </p>
      </FadeContent>

      <FadeContent className="mt-8 flex justify-center px-5 sm:mt-10" delay={0.2}>
        <div className="flex w-full max-w-[30rem] flex-col gap-3 sm:flex-row sm:gap-4">
          <Button
            className="group h-11 w-full min-w-0 flex-1 gap-0 rounded-xl border-primary/40 bg-primary/20! px-8 text-sm whitespace-nowrap hover:bg-primary/40! dark:border-white/30 dark:bg-slate-950/55! dark:text-white dark:hover:bg-slate-950/75! sm:h-12 sm:px-10 sm:text-base"
            onClick={onResumeFiltering}
            type="button"
            variant="outline"
          >
            <span>{messages.home_hero_resume_cta()}</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-[margin,max-width,opacity] duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <IconArrowRight aria-hidden="true" className="size-4" />
            </span>
          </Button>
          <Button
            className="group h-11 w-full min-w-0 flex-1 gap-0 rounded-xl border-background bg-background/60 px-8 text-sm whitespace-nowrap hover:bg-background/80 dark:border-white/50 dark:bg-white/85 dark:text-slate-950 dark:hover:bg-white sm:h-12 sm:px-10 sm:text-base"
            onClick={onWorkbench}
            type="button"
            variant="outline"
          >
            <span>{messages.home_hero_workbench_cta()}</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-[margin,max-width,opacity] duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <IconArrowRight aria-hidden="true" className="size-4" />
            </span>
          </Button>
        </div>
      </FadeContent>
    </section>
  );
}
