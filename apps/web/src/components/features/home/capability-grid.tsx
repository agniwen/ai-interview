// 用途：能力 bento。上排两张可操作的大卡（岗位语境切换、AI 追问示例），下排四张图标小卡。
// Purpose: capability bento — two interactive showcase cards above four compact icon tiles.
"use client";

import {
  IconArrowUpRight,
  IconCalendarEvent,
  IconChartBar,
  IconLink,
  IconSparkles,
  IconStack2,
} from "@tabler/icons-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import type { OverlayScrollbars } from "overlayscrollbars";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useEffect, useRef, useState } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { RecruitmentCopilotMark } from "@/components/layout/app-sidebar/recruitment-copilot-brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as messages from "@/paraglide/messages";
import { cn } from "@app/shared/utils";
import { getHomeDemoCopy } from "./home-demo-copy";
import { Section, SectionHeader } from "./section";
import type { StageArtworkPalette, StageArtworkPattern } from "./stage-artwork";
import { StageArtwork } from "./stage-artwork";

/** 追问示例每句出现的间隔。 Delay between lines in the follow-up sample. */
export const FOLLOWUP_LINE_INTERVAL_MS = 1400;
/** 一轮播完后停留多久再从头循环。 Pause after the last line before the loop restarts. */
export const FOLLOWUP_LOOP_PAUSE_MS = 2600;

const SWAP_TRANSITION = { duration: 0.25, ease: [0.22, 1, 0.36, 1] } as const;
/** 示例片段用半透明毛玻璃浮在颗粒背景上，不压大色块。 Fragments float as translucent glass over the grain. */
const GLASS =
  "bg-white/70 shadow-default ring-1 ring-white/60 backdrop-blur-md dark:bg-black/35 dark:ring-white/10";
/** 两张大卡的示例区同宽同高，播放或切换时尺寸不变。 Both fragment areas share one fixed size. */
const FRAGMENT_AREA = "flex h-[17rem] w-full max-w-[24rem] flex-col";
/** 筛选重点按权重展示。 Screening focus is shown with weights. */
const FOCUS_WEIGHTS = [40, 35, 25] as const;

interface ShowcaseCardProps {
  artwork: { palette: StageArtworkPalette; pattern: StageArtworkPattern };
  children: ReactNode;
  description: string;
  title: string;
}

/**
 * 大卡：颗粒渐变铺底，演示 UI 居上，标题与说明压在底部（对齐 ElevenLabs 的 bento 大卡）。
 * Showcase card: grain backdrop, demo UI on top, title and copy pinned to the bottom.
 */
function ShowcaseCard({ artwork, children, description, title }: ShowcaseCardProps) {
  return (
    <article className="relative flex h-full min-h-[25rem] flex-col overflow-hidden rounded-xl [&_[data-slot=badge]]:rounded-[8px] sm:min-h-[27rem]">
      <StageArtwork {...artwork} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/30" />
      <div className="relative flex flex-1 items-center justify-center px-4 pt-6 pb-2 sm:px-6">
        {children}
      </div>
      <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
        <h3 className="font-medium text-base text-white">{title}</h3>
        <p className="mt-1 max-w-[30rem] text-sm text-white/80 leading-relaxed">{description}</p>
      </div>
    </article>
  );
}

function ContextShowcase() {
  const { positions } = getHomeDemoCopy().capability;
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();
  const position = positions[activeIndex] ?? positions[0];

  return (
    <div className={cn(FRAGMENT_AREA, "items-center justify-center gap-3")}>
      <fieldset
        aria-label={messages.home_capability_context_aria()}
        className={cn(
          "flex min-w-0 max-w-full gap-0.5 overflow-x-auto rounded-full p-0.5 [scrollbar-width:none]",
          GLASS,
        )}
      >
        {positions.map((item, index) => {
          const selected = index === activeIndex;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "h-7 shrink-0 whitespace-nowrap rounded-full px-3 font-medium text-[12px] transition-colors duration-200",
                selected
                  ? "bg-card text-foreground shadow-default"
                  : "text-foreground/60 hover:text-foreground dark:text-white/70",
              )}
              data-context-position={index}
              key={item.name}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              {item.name}
            </button>
          );
        })}
      </fieldset>

      {/* 区域高度固定，切换岗位时只淡入淡出内容。 Fixed area; switching roles only crossfades content. */}
      <div className="relative h-[11.5rem] w-full">
        <AnimatePresence initial={false} mode="wait">
          <m.dl
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full flex-col gap-2.5"
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
            key={position.name}
            transition={reducedMotion ? { duration: 0 } : SWAP_TRANSITION}
          >
            <div className={cn("rounded-[12px] px-3.5 py-3", GLASS)}>
              <dt className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{messages.home_capability_context_focus()}</span>
                <span className="truncate">{position.interviewer}</span>
              </dt>
              <dd className="mt-2.5 space-y-2">
                {position.focus.map((focus, index) => {
                  const weight = FOCUS_WEIGHTS[index] ?? 0;
                  return (
                    <div className="flex items-center gap-2.5 text-[12px]" key={focus}>
                      <span className="w-24 shrink-0 truncate">{focus}</span>
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                        <span
                          className="block h-full rounded-full bg-primary/75"
                          style={{ width: `${(weight / FOCUS_WEIGHTS[0]) * 100}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right font-medium tabular-nums">
                        {weight}%
                      </span>
                    </div>
                  );
                })}
              </dd>
            </div>
            <div className={cn("rounded-[12px] px-3.5 py-2.5", GLASS)}>
              <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <IconSparkles aria-hidden="true" className="size-3 text-primary" />
                {messages.home_capability_context_question()}
              </dt>
              <dd className="mt-1 text-[12.5px] leading-relaxed" data-context-question>
                {position.question}
              </dd>
            </div>
          </m.dl>
        </AnimatePresence>
      </div>
    </div>
  );
}

const WAVE_BARS = [3, 5, 8, 4, 7, 9, 5, 6, 8, 4, 7, 5, 9, 6, 4, 8, 5, 7, 9, 4, 6, 8, 5, 7];

function FollowupShowcase() {
  const { capability, feature } = getHomeDemoCopy();
  const lines = capability.followup;
  const { candidateName } = feature;
  const reducedMotion = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [visibleCount, setVisibleCount] = useState(1);
  // 减弱动效时直接展示完整对话，不做循环。 With reduced motion the full exchange shows without looping.
  const shownCount = reducedMotion ? lines.length : visibleCount;
  const isPlaying = inView && !reducedMotion && visibleCount < lines.length;

  // 只在进入视口时播放，离开后暂停。 Plays only while on screen and pauses when scrolled away.
  useEffect(() => {
    const root = rootRef.current;
    const Observer = globalThis.IntersectionObserver;
    if (!(root && Observer)) {
      return;
    }
    const observer = new Observer(([entry]) => setInView(entry?.isIntersecting ?? false), {
      threshold: 0.4,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // 逐句出现；播完停一会儿后从第一句重新开始，循环播放。
  // Lines appear one by one; after the last line it pauses, then loops from the first line.
  useEffect(() => {
    if (!inView || reducedMotion) {
      return;
    }
    const finished = visibleCount >= lines.length;
    const timeout = window.setTimeout(
      () => setVisibleCount((count) => (count >= lines.length ? 1 : count + 1)),
      finished ? FOLLOWUP_LOOP_PAUSE_MS : FOLLOWUP_LINE_INTERVAL_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [inView, lines.length, reducedMotion, visibleCount]);

  // 每出现一句就滚到底；回到第一句时回到顶部。
  // Follow each new line to the bottom; looping back to the first line returns to the top.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.style.scrollBehavior = reducedMotion ? "auto" : "smooth";
    viewport.scrollTop = shownCount > 1 ? viewport.scrollHeight : 0;
  }, [reducedMotion, shownCount]);

  return (
    <div className={FRAGMENT_AREA} ref={rootRef}>
      <div className="flex items-center justify-center">
        <span
          className={cn(
            "flex h-7 items-center gap-2 rounded-full px-3 font-medium text-[12px]",
            GLASS,
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full bg-rose-500",
              isPlaying && "animate-pulse motion-reduce:animate-none",
            )}
          />
          {messages.home_capability_followup_live()}
          <span aria-hidden="true" className="ml-1 flex h-4 items-center gap-[2px]">
            {WAVE_BARS.slice(0, 12).map((height, index) => (
              <span
                className="w-[2px] rounded-full bg-foreground/40"
                // oxlint-disable-next-line react/no-array-index-key -- 波形条是静态装饰。 Static decorative bars.
                key={index}
                style={{
                  animation: isPlaying
                    ? `capability-wave 1.2s ease-in-out ${index * 0.05}s infinite`
                    : undefined,
                  height: `${height * 1.6}px`,
                  transform: isPlaying ? undefined : "scaleY(0.45)",
                }}
              />
            ))}
          </span>
        </span>
      </div>

      {/* 没有外层容器：气泡直接浮在背景上。区域高度固定，超出时在区内滚动，播放时尺寸不变。
          No container: bubbles float on the backdrop. The area has a fixed height and scrolls inside. */}
      <ScrollArea
        className="mt-2 min-h-0 flex-1"
        events={{
          initialized: (instance: OverlayScrollbars) => {
            viewportRef.current = instance.elements().viewport;
          },
        }}
        scrollFade
        scrollbars="leave"
      >
        <ol aria-live="polite" className="flex flex-col gap-3 py-3">
          {lines.slice(0, shownCount).map(([speaker, text], index) => {
            const fromAi = speaker === "ai";
            return (
              <m.li
                animate={{ opacity: 1, y: 0 }}
                data-followup-line={speaker}
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                // oxlint-disable-next-line react/no-array-index-key -- 对话按固定顺序逐句出现。 Lines appear in a fixed order.
                key={index}
                transition={SWAP_TRANSITION}
              >
                <Message align={fromAi ? "start" : "end"}>
                  <MessageContent className="gap-1.5">
                    {/* 头像与名字在上、气泡在下；名字加一圈柔和光晕，深浅背景上都清楚。
                        Avatar and name sit above the bubble; a soft halo keeps the name readable on any backdrop. */}
                    <MessageHeader className="w-fit gap-1.5 px-0.5 font-medium text-[11px] text-foreground/75 drop-shadow-[0_0_6px_rgb(255_255_255/0.9)] dark:text-white/85 dark:drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]">
                      {fromAi ? (
                        <RecruitmentCopilotMark className="size-6 rounded-full bg-cover" />
                      ) : (
                        <Avatar
                          className="size-6"
                          label={candidateName}
                          seed={`candidate:${candidateName}`}
                          size="sm"
                        >
                          <AvatarFallback>{candidateName.slice(0, 1)}</AvatarFallback>
                        </Avatar>
                      )}
                      {fromAi ? messages.home_capability_followup_ai() : candidateName}
                    </MessageHeader>
                    <Bubble variant={fromAi ? "outline" : "default"}>
                      <BubbleContent
                        className={cn(
                          "text-[12.5px] shadow-default backdrop-blur-md",
                          fromAi
                            ? "border-white/60! bg-white/70! text-foreground! dark:border-white/10! dark:bg-black/35!"
                            : "border-transparent! bg-primary/80! text-primary-foreground!",
                        )}
                      >
                        {text}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </m.li>
            );
          })}
        </ol>
      </ScrollArea>
      <style>{`
        @keyframes capability-wave {
          0%, 100% { transform: scaleY(0.4); }
          50%      { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

interface CompactTileProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  description: string;
  title: string;
}

function CompactTile({ Icon, description, title }: CompactTileProps) {
  return (
    <article className="flex h-full flex-col justify-between rounded-xl bg-home-canvas p-5 dark:bg-white/[0.04]">
      <span className="inline-flex size-9 items-center justify-center rounded-[8px] border border-border bg-background/70">
        <Icon aria-hidden="true" className="size-[18px] text-foreground/80" strokeWidth={1.5} />
      </span>
      <div className="mt-5">
        <h3 className="text-muted-foreground text-sm">{title}</h3>
        <p className="mt-1.5 text-pretty text-[15px] text-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </article>
  );
}

function getCompactTiles(): CompactTileProps[] {
  return [
    {
      Icon: IconStack2,
      description: messages.home_capability_pipeline_description(),
      title: messages.home_capability_pipeline_title(),
    },
    {
      Icon: IconLink,
      description: messages.home_capability_link_description(),
      title: messages.home_capability_link_title(),
    },
    {
      Icon: IconCalendarEvent,
      description: messages.home_capability_schedule_description(),
      title: messages.home_capability_schedule_title(),
    },
    {
      Icon: IconChartBar,
      description: messages.home_capability_dashboard_description(),
      title: messages.home_capability_dashboard_title(),
    },
  ];
}

export function CapabilityGrid({ onResumeFiltering }: { onResumeFiltering: () => void }) {
  return (
    <Section id="capabilities">
      <SectionHeader
        action={
          <Button
            className="group h-10 gap-1.5 rounded-full border-border bg-card px-5 font-medium shadow-none"
            onClick={onResumeFiltering}
            type="button"
            variant="outline"
          >
            {messages.home_hero_resume_cta()}
            <IconArrowUpRight
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
            />
          </Button>
        }
        lead={messages.home_capability_lead()}
        title={messages.home_capability_title()}
      />

      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FadeContent className="h-full sm:col-span-2">
          <ShowcaseCard
            artwork={{ palette: "sky", pattern: "contours" }}
            description={messages.home_capability_context_description()}
            title={messages.home_capability_context_title()}
          >
            <ContextShowcase />
          </ShowcaseCard>
        </FadeContent>
        <FadeContent className="h-full sm:col-span-2" delay={0.05}>
          <ShowcaseCard
            artwork={{ palette: "harbor", pattern: "waves" }}
            description={messages.home_capability_followup_description()}
            title={messages.home_capability_followup_title()}
          >
            <FollowupShowcase />
          </ShowcaseCard>
        </FadeContent>
        {getCompactTiles().map((tile, index) => (
          <FadeContent className="h-full" delay={0.05 * (index + 2)} key={tile.title}>
            <CompactTile {...tile} />
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
