// 用途：首页 Hero 区，保留原有视觉与 CTA
// Purpose: Hero section preserving original visuals + CTAs.
"use client";

import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { SplitText } from "@/components/react-bits/split-text";
import { Button } from "@/components/ui/button";

interface HeroProps {
  isPending: boolean;
  onResumeFiltering: () => void;
  onWorkbench: () => void;
}

export function Hero({ isPending, onResumeFiltering, onWorkbench }: HeroProps) {
  return (
    <section className="relative w-full text-center">
      <FadeContent>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 font-medium text-[11px] text-primary sm:text-xs">
          <SparklesIcon aria-hidden="true" className="size-3" />
          招聘协作工作台
        </p>
      </FadeContent>

      <h1 className="pixel-title mt-6 mx-auto max-w-5xl text-balance font-bold text-[2rem] text-foreground leading-[1.15] tracking-tight sm:mt-8 sm:text-6xl lg:text-[4.5rem]">
        <SplitText text="从简历筛选到模拟面试，用同一套工作流完成候选人评估" />
      </h1>

      <FadeContent className="mt-5 mx-auto max-w-2xl sm:mt-7" delay={0.1}>
        <p className="font-serif text-sm text-muted-foreground leading-relaxed sm:text-lg sm:leading-[1.8]">
          先用聊天式方式完成简历初筛，再进入实时语音模拟面试，连续查看候选人的亮点、风险、追问过程与回答表现，让招聘判断更完整。
        </p>
      </FadeContent>

      <FadeContent className="mt-8 flex items-center justify-center sm:mt-10" delay={0.2}>
        <div className="inline-flex items-stretch">
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
      </FadeContent>
    </section>
  );
}
