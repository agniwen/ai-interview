// 用途：页脚上方的二次 CTA
// Purpose: Secondary CTA above footer.
"use client";

import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionTitle } from "./section";

interface CtaSectionProps {
  isPending: boolean;
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

export function CtaSection({ isPending, onResumeFiltering, onWorkbench }: CtaSectionProps) {
  return (
    <Section width="wide">
      <div className="rounded-3xl border border-primary/15 bg-primary/5 px-8 py-16 text-center backdrop-blur sm:px-12 sm:py-20">
        <SectionTitle className="mx-auto text-balance">准备好让招聘流程更连续了吗？</SectionTitle>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg">
          从一份简历开始，在同一个工作台里完成筛选、面试与评估。
        </p>
        <div className="mt-8 inline-flex items-stretch">
          <Button
            className="group h-11 min-w-[12em] gap-0 rounded-l-xl rounded-r-none border-primary/40 bg-primary/20! px-8 text-sm backdrop-blur-md hover:bg-primary/40! sm:h-12 sm:px-10 sm:text-base"
            disabled={isPending}
            onClick={onResumeFiltering}
            type="button"
            variant="outline"
          >
            <span>开始简历筛选</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </span>
          </Button>
          <Button
            className="group h-11 min-w-[12em] gap-0 rounded-l-none rounded-r-xl border-background bg-background/60 px-8 text-sm backdrop-blur-md hover:bg-background/80 sm:h-12 sm:px-10 sm:text-base"
            disabled={isPending}
            onClick={onWorkbench}
            type="button"
            variant="outline"
          >
            <span>进入工作台</span>
            <span className="inline-flex max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:max-w-4 group-hover:opacity-100">
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </span>
          </Button>
        </div>
      </div>
    </Section>
  );
}
