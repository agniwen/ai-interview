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
    // 标题两行（品牌 + 定位、不带标点）；桌面端说明段放右栏底部右对齐，移动端依次排在标题下方。
    // Two-line title; on desktop the lead sits bottom-right, on mobile it stacks under the title.
    <section className="relative flex w-full flex-col items-start text-left lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(26rem,0.5fr)] lg:gap-x-16">
      <h1
        className={`${ENTER} slide-in-from-bottom-[18px] font-medium text-4xl text-foreground leading-[1.33] tracking-[-0.02em] dark:text-white`}
      >
        <span className="block">AI Hiring Copilot</span>
        <span className="block">{messages.home_hero_tagline()}</span>
      </h1>

      <div
        className={`${ENTER} slide-in-from-bottom-3 mt-4 max-w-[30rem] delay-[120ms] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-end lg:justify-self-end lg:pb-1 lg:text-right`}
      >
        <LeadText className="max-w-none text-base text-muted-foreground leading-[1.6] sm:text-base lg:text-base xl:text-base">
          {messages.home_hero_description()}
        </LeadText>
      </div>

      <div
        className={`${ENTER} slide-in-from-bottom-3 delay-[180ms] mt-8 flex flex-wrap items-center gap-3 lg:col-start-1 lg:row-start-2`}
      >
        <Button
          className="group h-9 gap-2 rounded-full px-5 font-medium text-sm shadow-none has-[>svg]:px-5"
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
          className="h-9 rounded-full border-foreground/15 bg-transparent px-5 font-medium text-sm shadow-none hover:bg-foreground/5"
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
