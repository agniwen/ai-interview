"use client";

import { IconArrowUpRight } from "@tabler/icons-react";
import { m, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import * as messages from "@/paraglide/messages";

interface HeroProps {
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

export function Hero({ onResumeFiltering, onWorkbench }: HeroProps) {
  const reducedMotion = useReducedMotion();
  const tagline = messages.home_hero_tagline().replace(/([，、,.])\s*/u, "$1\n");

  return (
    <section className="relative grid w-full gap-y-8 text-left lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.42fr)] lg:gap-x-16 lg:gap-y-10">
      <m.h1
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[9em] whitespace-pre-line font-medium text-[clamp(2.75rem,7.8vw,7.5rem)] text-foreground leading-[1.12] tracking-[-0.055em] dark:text-white"
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        {tagline}
      </m.h1>

      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[23rem] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-end lg:pb-1"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        transition={{ delay: 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="text-pretty text-base text-foreground/70 leading-[1.9] dark:text-white/75 sm:text-lg lg:text-base xl:text-lg">
          {messages.home_hero_description()}
        </p>
      </m.div>

      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:col-start-1 lg:row-start-2 sm:gap-x-8"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        transition={{ delay: 0.18, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <Button
          className="group h-12 gap-6 rounded-full px-6 text-sm shadow-none has-[>svg]:px-6 sm:h-14 sm:px-7 sm:text-base sm:has-[>svg]:px-7"
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
          className="h-12 px-0 text-sm sm:text-base"
          onClick={onWorkbench}
          type="button"
          variant="text"
        >
          <span className="underline decoration-foreground/30 underline-offset-8">
            {messages.home_hero_workbench_cta()}
          </span>
        </Button>
      </m.div>
    </section>
  );
}
