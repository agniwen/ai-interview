"use client";

import {
  IconClipboardList,
  IconGauge,
  IconMessage2,
  IconRadio,
  IconShieldCheck,
  IconSparkles,
} from "@tabler/icons-react";
// 用途：Bento 风格的能力分区，主特性卡 + 宽窄不一的 tile，承载招聘场景的核心能力
// Purpose: Bento-style capability section — featured tile + varied-size tiles for headline capabilities.
import type { ComponentType, ReactNode, SVGProps } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { Badge } from "@/components/ui/badge";
import * as messages from "@/paraglide/messages";
import { cn } from "@arc/shared/utils";
import { CenterCarousel } from "./center-carousel";
import { Section, SectionLead, SectionTitle } from "./section";

type TileLayout = "stacked" | "split";

interface BentoTileProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  className?: string;
  description: string;
  layout?: TileLayout;
  title: string;
  visual?: ReactNode;
}

function BentoTile({
  Icon,
  className,
  description,
  layout = "stacked",
  title,
  visual,
}: BentoTileProps) {
  const isSplit = layout === "split";

  const head = (
    <div>
      <Icon aria-hidden="true" className="size-6 text-foreground/55" strokeWidth={1.25} />
      <h3 className="mt-6 text-balance font-medium text-foreground text-lg leading-tight tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-foreground/70 text-sm leading-normal dark:text-white/80">
        {description}
      </p>
    </div>
  );

  return (
    <article
      className={cn(
        // 与 FeatureBlocks SceneCard 同款边距与材质：p-5 sm:p-6 / 同款圆角、淡边、轻投影、毛玻璃
        // Match FeatureBlocks SceneCard padding & material: p-5 sm:p-6, same rounded / faint border / soft drop / blur
        "group relative flex h-full flex-col overflow-hidden rounded-3xl ring-1 ring-foreground/5 bg-background/60 p-5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur transition-[translate,box-shadow,background-color] duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] hover:-translate-y-px hover:ring-foreground/[0.08] hover:bg-background/70 hover:shadow-[0_12px_32px_-24px_rgba(0,0,0,0.24)] motion-reduce:translate-y-0 motion-reduce:transition-none sm:p-6",
        className,
      )}
    >
      {isSplit ? (
        <div className="flex flex-1 flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:gap-8">
          <div className="lg:flex-1">{head}</div>
          {visual && <div className="min-w-0 lg:flex-1">{visual}</div>}
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          {head}
          {visual && <div className="mt-4 sm:mt-5">{visual}</div>}
        </div>
      )}
    </article>
  );
}

// --- Visuals (no top margin; tile controls spacing) ---

function ChatBubblesVisual() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="ml-auto max-w-[78%] rounded-2xl rounded-br-md ring-1 ring-foreground/5 bg-foreground/[0.04] px-3.5 py-2 text-right font-medium text-[13px] text-foreground/85 shadow-sm">
        {messages.home_chat_question_one()}
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-bl-md ring-1 ring-foreground/5 bg-background/80 px-3.5 py-2 text-[13px] text-foreground/80 shadow-sm">
        {messages.home_chat_answer_one()}
        <span className="mt-1 block text-foreground/55 text-xs">
          {messages.home_chat_followup()}
        </span>
      </div>
      <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md ring-1 ring-foreground/5 bg-foreground/[0.04] px-3.5 py-2 text-right font-medium text-[13px] text-foreground/85 shadow-sm">
        {messages.home_chat_question_two()}
      </div>
      <div className="max-w-[90%] rounded-2xl rounded-bl-md ring-1 ring-foreground/5 bg-background/80 px-3.5 py-2 text-[13px] text-foreground/80 shadow-sm">
        <span className="block">{messages.home_chat_answer_two()}</span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge variant="success">{messages.home_chat_strength()}</Badge>
          <Badge variant="warning">{messages.home_chat_risk()}</Badge>
        </span>
      </div>
      <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md ring-1 ring-foreground/5 bg-foreground/[0.04] px-3.5 py-2 text-right font-medium text-[13px] text-foreground/85 shadow-sm">
        {messages.home_chat_shortlist()}
      </div>
      <div className="inline-flex items-center gap-1 self-start text-foreground/45 text-xs">
        <span className="size-1 animate-pulse rounded-full bg-foreground/40" />
        <span className="size-1 animate-pulse rounded-full bg-foreground/40 [animation-delay:120ms]" />
        <span className="size-1 animate-pulse rounded-full bg-foreground/40 [animation-delay:240ms]" />
        <span className="ml-1.5">{messages.home_chat_thinking()}</span>
      </div>
    </div>
  );
}

// 工作台配置：mock 岗位列表，每行带题数与状态
function WorkbenchVisual() {
  const positions = [
    { count: 12, draft: false, name: messages.home_position_frontend() },
    { count: 8, draft: false, name: messages.home_position_product() },
    { count: 6, draft: true, name: messages.home_position_data() },
  ];
  return (
    <ul className="flex flex-col divide-y divide-foreground/[0.06] overflow-hidden rounded-xl ring-1 ring-foreground/5 bg-background/70 shadow-sm">
      {positions.map((p) => (
        <li
          className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]"
          key={p.name}
        >
          <span className="truncate font-medium text-foreground/85">{p.name}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[11px] text-foreground/55">
              {messages.home_question_count({ count: p.count })}
            </span>
            <Badge variant={p.draft ? "secondary" : "success"}>
              {p.draft ? messages.home_status_draft() : messages.home_status_published()}
            </Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

// 智能追问：嵌套的追问链路
function FollowUpVisual() {
  return (
    <div className="flex flex-col gap-1.5 font-mono text-[12px]">
      <div className="rounded-md ring-1 ring-foreground/5 bg-background/80 px-2.5 py-1.5 text-foreground/80 shadow-sm">
        {messages.home_followup_state()}
      </div>
      <div className="ml-3 rounded-md ring-1 ring-foreground/5 bg-background/60 px-2.5 py-1.5 text-foreground/65 shadow-sm">
        {messages.home_followup_zustand()}
      </div>
      <div className="ml-6 rounded-md ring-1 ring-foreground/5 bg-background/40 px-2.5 py-1.5 text-foreground/55 shadow-sm">
        {messages.home_followup_migration()}
      </div>
    </div>
  );
}

// 实时语音面试：LIVE 标记 + 律动波形 + 实时字幕
function LiveVoiceVisual() {
  const bars = [
    3, 5, 8, 4, 7, 9, 5, 6, 8, 4, 7, 5, 9, 6, 4, 8, 5, 7, 9, 4, 6, 8, 5, 7, 4, 9, 5, 8, 6, 3, 7, 5,
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Badge variant="danger">
          <span className="size-1.5 animate-pulse rounded-full bg-rose-500" />
          LIVE
        </Badge>
        <span className="font-mono text-[11px] text-foreground/55 tabular-nums">04:32</span>
      </div>
      <div className="flex h-7 w-full items-center justify-between">
        {bars.map((h, i) => (
          <span
            className="w-[3px] rounded-full bg-foreground/40"
            key={i}
            style={{
              animation: `bento-pulse 1.4s ease-in-out ${i * 0.06}s infinite`,
              height: `${h * 2.5}px`,
            }}
          />
        ))}
      </div>
      <p className="truncate rounded-md ring-1 ring-foreground/5 bg-background/70 px-2.5 py-1.5 text-[12px] text-foreground/70 shadow-sm">
        {messages.home_live_transcript()}
      </p>
      <style>{`
        @keyframes bento-pulse {
          0%, 100% { transform: scaleY(0.4); opacity: 0.55; }
          50%      { transform: scaleY(1);   opacity: 0.95; }
        }
      `}</style>
    </div>
  );
}

// 结构化评估：评估维度 + 进度条
function ScoreVisual() {
  const rows = [
    { label: messages.home_score_strength(), tone: "emerald", value: 0.8 },
    { label: messages.home_score_risk(), tone: "amber", value: 0.25 },
    { label: messages.home_score_recommendation(), tone: "foreground", value: 0.84 },
  ] as const;
  const toneClass = {
    amber: "bg-amber-500/70 dark:bg-amber-400/70",
    emerald: "bg-emerald-500/70 dark:bg-emerald-400/70",
    foreground: "bg-foreground/60",
  } as const satisfies Record<(typeof rows)[number]["tone"], string>;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div className="flex items-center gap-3" key={r.label}>
          <span className="w-12 shrink-0 text-[12px] text-foreground/55">{r.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className={cn("h-full rounded-full", toneClass[r.tone])}
              style={{ width: `${r.value * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-[11px] text-foreground/55 tabular-nums">
            {Math.round(r.value * 100)}
          </span>
        </div>
      ))}
    </div>
  );
}

// 数据边界：权限与记录清单 + 勾选
function PrivacyVisual() {
  const items = [
    messages.home_privacy_permissions(),
    messages.home_privacy_traceable(),
    messages.home_privacy_manageable(),
  ];
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t) => (
        <li
          className="flex items-center gap-2 rounded-md ring-1 ring-foreground/5 bg-background/70 px-2.5 py-1.5 text-[12px] text-foreground/75 shadow-sm"
          key={t}
        >
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <svg
              aria-hidden="true"
              className="size-2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

interface BentoConfig extends Omit<BentoTileProps, "className"> {
  span: string;
}

function getTiles(): BentoConfig[] {
  return [
    {
      Icon: IconMessage2,
      description: messages.home_capability_evidence_description(),
      span: "lg:col-span-2 lg:row-span-2",
      title: messages.home_capability_evidence_title(),
      visual: <ChatBubblesVisual />,
    },
    {
      Icon: IconClipboardList,
      description: messages.home_capability_context_description(),
      layout: "split",
      span: "lg:col-span-2",
      title: messages.home_capability_context_title(),
      visual: <WorkbenchVisual />,
    },
    {
      Icon: IconSparkles,
      description: messages.home_capability_followup_description(),
      span: "lg:col-span-1",
      title: messages.home_capability_followup_title(),
      visual: <FollowUpVisual />,
    },
    {
      Icon: IconRadio,
      description: messages.home_capability_interview_description(),
      span: "lg:col-span-1",
      title: messages.home_capability_interview_title(),
      visual: <LiveVoiceVisual />,
    },
    {
      Icon: IconGauge,
      description: messages.home_capability_review_description(),
      layout: "split",
      span: "lg:col-span-2",
      title: messages.home_capability_review_title(),
      visual: <ScoreVisual />,
    },
    {
      Icon: IconShieldCheck,
      description: messages.home_capability_privacy_description(),
      layout: "split",
      span: "lg:col-span-2",
      title: messages.home_capability_privacy_title(),
      visual: <PrivacyVisual />,
    },
  ];
}

// PC（lg+）：原 Bento 网格 / Desktop bento grid
function CapabilityBento() {
  const tiles = getTiles();
  return (
    <div className="mt-12 hidden gap-4 sm:gap-5 lg:grid lg:auto-rows-[minmax(180px,auto)] lg:grid-cols-4">
      {tiles.map(({ span, ...tile }, index) => (
        <FadeContent className={cn("h-full", span)} delay={0.05 * index} key={tile.title}>
          <BentoTile {...tile} />
        </FadeContent>
      ))}
    </div>
  );
}

// 移动端（< lg）：循环自动播放的 carousel，主卡居中、左右露出邻卡
// Mobile: looping autoplay carousel with center alignment, neighbors peek on both sides
function CapabilityCarousel() {
  const tiles = getTiles();
  return (
    <CenterCarousel
      className="mt-10 lg:hidden"
      items={tiles.map((tile) => ({
        key: tile.title,
        label: tile.title,
        node: <BentoTile {...tile} />,
      }))}
    />
  );
}

export function CapabilityGrid() {
  return (
    <Section width="wide">
      <div className="max-w-3xl">
        <SectionTitle className="mt-0">{messages.home_capability_title()}</SectionTitle>
        <SectionLead>{messages.home_capability_lead()}</SectionLead>
      </div>

      <CapabilityBento />
      <CapabilityCarousel />
    </Section>
  );
}
