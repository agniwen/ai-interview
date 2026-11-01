// 用途：页尾收束 CTA，颗粒渐变面板上一句话加两个入口按钮，与首屏按钮一致。
// Purpose: closing CTA — one line and the two hero entry buttons on a grain panel.
"use client";

import { IconArrowUpRight } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import * as messages from "@/paraglide/messages";
import { Section } from "./section";
import { StageArtwork } from "./stage-artwork";

interface CtaSectionProps {
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

export function CtaSection({ onResumeFiltering, onWorkbench }: CtaSectionProps) {
  return (
    <Section>
      <div className="relative isolate overflow-hidden rounded-[18px] px-6 py-16 text-center sm:py-20 lg:py-24">
        <StageArtwork palette="azure" pattern="rays" />
        <div className="pointer-events-none absolute inset-0 bg-black/10" />
        <div className="relative flex flex-col items-center">
          <h2 className="text-balance font-medium text-[clamp(1.75rem,3vw,2.5rem)] text-white leading-[1.25] tracking-[-0.03em]">
            {messages.home_cta_title()}
          </h2>
          <p className="mt-3 max-w-[32rem] text-pretty text-base text-white/80 leading-relaxed">
            {messages.home_cta_lead()}
          </p>
          <div className="mt-8 grid w-full max-w-xs grid-cols-1 gap-3 sm:w-auto sm:max-w-none sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
            <Button
              className="group h-11 min-w-40 gap-2 rounded-full border-transparent bg-white px-6 font-medium text-[#071233] text-[15px] shadow-none inset-shadow-none hover:bg-white/90 has-[>svg]:px-6 active:inset-shadow-none"
              onClick={onResumeFiltering}
              type="button"
            >
              {messages.home_hero_resume_cta()}
              <IconArrowUpRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                data-icon="inline-end"
              />
            </Button>
            <Button
              className="h-11 min-w-40 rounded-full border-white/35 bg-white/10 px-6 font-medium text-[15px] text-white shadow-none backdrop-blur-md hover:bg-white/20 hover:text-white dark:border-white/25 dark:bg-white/10 dark:hover:bg-white/15"
              onClick={onWorkbench}
              type="button"
              variant="outline"
            >
              {messages.home_hero_workbench_cta()}
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
