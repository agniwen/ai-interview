"use client";

import { IconArrowUpRight } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import * as messages from "@/paraglide/messages";
import { LeadText } from "./section";

interface HeroProps {
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

// 入场动画用 CSS（tw-animate-css），SSR 文本无需等水合即可显示。
// CSS entrance animations keep SSR text visible without waiting for hydration.
const ENTER =
  "animate-in fade-in fill-mode-both duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none";

export function Hero({ onResumeFiltering, onWorkbench }: HeroProps) {
  return (
    // 居中排版：两行粗体大标题、居中说明段、加大的胶囊按钮，对标 shaders.com 官方示例。
    // Centered layout: bold two-line headline, centered lead and large pill CTAs.
    <section className="relative flex w-full flex-col items-center text-center">
      <h1
        className={`${ENTER} slide-in-from-bottom-[18px] font-semibold text-[clamp(2.25rem,4.6vw,4.75rem)] text-foreground leading-[1.08] tracking-[-0.045em] [text-wrap:balance] dark:text-white`}
      >
        <span className="block">AI Hiring Copilot</span>
        <span className="block">{messages.home_hero_tagline()}</span>
      </h1>

      <div className={`${ENTER} slide-in-from-bottom-3 mt-5 delay-[120ms] sm:mt-6 2xl:mt-8`}>
        <LeadText className="mx-auto max-w-[34rem] text-base text-foreground/70 leading-[1.75] sm:text-base lg:text-base xl:text-base 2xl:text-lg dark:text-white/75">
          {messages.home_hero_description()}
        </LeadText>
      </div>

      <div
        className={`${ENTER} slide-in-from-bottom-3 delay-[180ms] mt-8 flex flex-wrap items-center justify-center gap-3 2xl:mt-10`}
      >
        <Button
          className="group h-11 w-40 gap-2 rounded-full border-transparent bg-foreground px-0 font-medium text-background text-[15px] shadow-none inset-shadow-none hover:bg-foreground/90 has-[>svg]:px-0 active:inset-shadow-none dark:bg-white dark:text-[#071233] dark:hover:bg-white/90"
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
          className="h-11 w-40 rounded-full border-white/70 bg-white/55 px-0 font-medium text-[15px] shadow-none backdrop-blur-md hover:bg-white/75 dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/15"
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
