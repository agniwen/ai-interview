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
import { cn } from "@arc/shared/utils";
import { CenterCarousel } from "./center-carousel";
import { Eyebrow, Section, SectionLead, SectionTitle } from "./section";

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
      <h3 className="mt-6 font-medium text-foreground text-lg leading-tight tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-foreground/70 text-sm leading-normal">{description}</p>
    </div>
  );

  return (
    <article
      className={cn(
        // 与 FeatureBlocks SceneCard 同款边距与材质：p-5 sm:p-6 / 同款圆角、淡边、轻投影、毛玻璃
        // Match FeatureBlocks SceneCard padding & material: p-5 sm:p-6, same rounded / faint border / soft drop / blur
        "group relative flex h-full flex-col overflow-hidden rounded-3xl ring-1 ring-foreground/5 bg-background/60 p-5 shadow-[0_4px_18px_-12px_rgba(0,0,0,0.18)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-22px_rgba(0,0,0,0.25)] sm:p-6",
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
        这位候选人有 SaaS 出海经验吗？
      </div>
      <div className="max-w-[88%] rounded-2xl rounded-bl-md ring-1 ring-foreground/5 bg-background/80 px-3.5 py-2 text-[13px] text-foreground/80 shadow-sm">
        近 3 年在新加坡与马来负责 B2B 出海，主导过 2 次定价策略调整。
        <span className="mt-1 block text-foreground/55 text-xs">
          ↳ 追问：定价调整带来的留存影响？
        </span>
      </div>
      <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md ring-1 ring-foreground/5 bg-foreground/[0.04] px-3.5 py-2 text-right font-medium text-[13px] text-foreground/85 shadow-sm">
        他和上一位候选人，在出海经验上的差异？
      </div>
      <div className="max-w-[90%] rounded-2xl rounded-bl-md ring-1 ring-foreground/5 bg-background/80 px-3.5 py-2 text-[13px] text-foreground/80 shadow-sm">
        <span className="block">他更偏战略与定价；上一位偏渠道执行。</span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-[11px] text-emerald-600 dark:text-emerald-300">
            亮点 · 跨区定价
          </span>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-[11px] text-amber-600 dark:text-amber-300">
            风险 · 团队规模较小
          </span>
        </span>
      </div>
      <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-md ring-1 ring-foreground/5 bg-foreground/[0.04] px-3.5 py-2 text-right font-medium text-[13px] text-foreground/85 shadow-sm">
        把他加入复试名单
      </div>
      <div className="inline-flex items-center gap-1 self-start text-foreground/45 text-xs">
        <span className="size-1 animate-pulse rounded-full bg-foreground/40" />
        <span className="size-1 animate-pulse rounded-full bg-foreground/40 [animation-delay:120ms]" />
        <span className="size-1 animate-pulse rounded-full bg-foreground/40 [animation-delay:240ms]" />
        <span className="ml-1.5">AI 正在整理候选人摘要…</span>
      </div>
    </div>
  );
}

// 工作台配置：mock 岗位列表，每行带题数与状态
function WorkbenchVisual() {
  const positions: { count: number; name: string; status: string }[] = [
    { count: 12, name: "高级前端工程师", status: "已发布" },
    { count: 8, name: "产品经理", status: "已发布" },
    { count: 6, name: "数据分析师", status: "草稿" },
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
            <span className="font-mono text-[11px] text-foreground/55">{p.count} 题</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium text-[10px]",
                p.status === "草稿"
                  ? "bg-foreground/[0.06] text-foreground/55"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
              )}
            >
              {p.status}
            </span>
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
        Q · 状态管理选型？
      </div>
      <div className="ml-3 rounded-md ring-1 ring-foreground/5 bg-background/60 px-2.5 py-1.5 text-foreground/65 shadow-sm">
        ↳ 选 Zustand 的考量？
      </div>
      <div className="ml-6 rounded-md ring-1 ring-foreground/5 bg-background/40 px-2.5 py-1.5 text-foreground/55 shadow-sm">
        ↳ 团队迁移成本？
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-medium text-[10px] text-rose-600 dark:text-rose-300">
          <span className="size-1.5 animate-pulse rounded-full bg-rose-500" />
          LIVE
        </span>
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
        “…让我介绍最近主导的项目”
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
  const rows: { label: string; tone: "amber" | "emerald" | "foreground"; value: number }[] = [
    { label: "亮点", tone: "emerald", value: 0.8 },
    { label: "风险", tone: "amber", value: 0.25 },
    { label: "推荐度", tone: "foreground", value: 0.84 },
  ];
  const toneClass: Record<(typeof rows)[number]["tone"], string> = {
    amber: "bg-amber-500/70 dark:bg-amber-400/70",
    emerald: "bg-emerald-500/70 dark:bg-emerald-400/70",
    foreground: "bg-foreground/60",
  };
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

// 数据可控：隐私清单 + 勾选
function PrivacyVisual() {
  const items = ["仅用于本次评估", "不参与模型训练", "可随时清除原始数据"];
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

const tiles: BentoConfig[] = [
  {
    Icon: IconMessage2,
    description:
      "围绕岗位语境追问候选人亮点与风险，AI 持续根据回答继续深挖，而不是简单的关键词匹配。",
    span: "lg:col-span-2 lg:row-span-2",
    title: "聊天式筛选",
    visual: <ChatBubblesVisual />,
  },
  {
    Icon: IconClipboardList,
    description: "在工作台维护岗位、JD、面试官人设、面试问题，全局复用。",
    layout: "split",
    span: "lg:col-span-2",
    title: "工作台配置",
    visual: <WorkbenchVisual />,
  },
  {
    Icon: IconSparkles,
    description: "AI 自动追问、记录节奏与停顿，沉淀完整对话上下文。",
    span: "lg:col-span-1",
    title: "智能追问",
    visual: <FollowUpVisual />,
  },
  {
    Icon: IconRadio,
    description: "一键发起实时语音模拟面试，候选人通过链接即可参与。",
    span: "lg:col-span-1",
    title: "实时语音面试",
    visual: <LiveVoiceVisual />,
  },
  {
    Icon: IconGauge,
    description: "结构化展示候选人亮点、风险、推荐度，团队判断有共同依据。",
    layout: "split",
    span: "lg:col-span-2",
    title: "结构化评估",
    visual: <ScoreVisual />,
  },
  {
    Icon: IconShieldCheck,
    description: "简历内容与面试录音仅用于本次评估，不会用于训练模型。",
    layout: "split",
    span: "lg:col-span-2",
    title: "数据可控",
    visual: <PrivacyVisual />,
  },
];

// PC（lg+）：原 Bento 网格 / Desktop bento grid
function CapabilityBento() {
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
        <Eyebrow>Capabilities</Eyebrow>
        <SectionTitle>招聘要用的，一件没少。</SectionTitle>
        <SectionLead>从筛简历、问问题、判作答到下结论，AI 在每一环都把推理摊开给你看。</SectionLead>
      </div>

      <CapabilityBento />
      <CapabilityCarousel />
    </Section>
  );
}
