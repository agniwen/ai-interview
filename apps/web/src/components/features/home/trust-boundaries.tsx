// 用途：人机边界与数据边界。三张等宽卡，上半部颗粒渐变配一块小 UI，下半部一句话说明。
// Purpose: human/AI and data boundaries — three equal cards, grain artwork with a small UI chip above one line of copy.
"use client";

import {
  IconFileText,
  IconHistory,
  IconInfoCircle,
  IconLock,
  IconMicrophone,
  IconPointerFilled,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { FadeContent } from "@/components/react-bits/fade-content";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as messages from "@/paraglide/messages";
import { cn } from "@app/shared/utils";
import { getHomeDemoCopy } from "./home-demo-copy";
import { Section, SectionHeader } from "./section";
import type { StageArtworkPalette, StageArtworkPattern } from "./stage-artwork";
import { StageArtwork } from "./stage-artwork";

interface BoundaryCardProps {
  artwork: { palette: StageArtworkPalette; pattern: StageArtworkPattern };
  description: string;
  title: string;
  visual: ReactNode;
}

/** 16:9 舞台的设计尺寸。 Design size of the 16:9 stage. */
const STAGE_WIDTH = 512;
const STAGE_HEIGHT = 288;

function BoundaryCard({ artwork, description, title, visual }: BoundaryCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl bg-home-canvas dark:bg-white/[0.04]">
      {/* 16:9 画布：示例 UI 在固定尺寸里排版，再按卡片宽度整体缩放，各断点比例与留白一致。
          16:9 stage: the fragment is laid out on a fixed canvas and scaled to the card width. */}
      <div
        className="relative aspect-video overflow-hidden"
        style={{ containerType: "inline-size" }}
      >
        <StageArtwork {...artwork} />
        <div
          className="absolute top-0 left-0 grid place-items-center"
          style={{
            height: STAGE_HEIGHT,
            transform: `scale(calc(100cqi / ${STAGE_WIDTH}px))`,
            transformOrigin: "top left",
            width: STAGE_WIDTH,
          }}
        >
          <div className="w-[19rem]">{visual}</div>
        </div>
      </div>
      <div className="px-5 pt-4 pb-5">
        <h3 className="font-medium text-base text-foreground">{title}</h3>
        <p className="mt-1 text-pretty text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </article>
  );
}

/** 卡片背后再垫一层半透明纸面，给示例 UI 一点纵深。 A translucent sheet behind each fragment adds depth. */
function LayeredFragment({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-x-5 -bottom-2.5 h-10 rounded-[10px] bg-white/45 shadow-default backdrop-blur-sm dark:bg-white/10" />
      <div className="relative overflow-hidden rounded-[10px] bg-card text-[12px] shadow-large">
        {children}
      </div>
    </div>
  );
}

function DecisionVisual() {
  const copy = getHomeDemoCopy().trust.decision;
  return (
    <LayeredFragment>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <Avatar
          className="size-7"
          label={copy.candidate}
          seed={`candidate:${copy.candidate}`}
          size="sm"
        >
          <AvatarFallback>{copy.candidate.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-[13px]">{copy.candidate}</p>
          <p className="truncate text-[11px] text-muted-foreground">{copy.role}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3.5 py-2.5">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <IconSparkles aria-hidden="true" className="size-3.5 text-primary" />
          {copy.aiLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-[11px] text-primary">
            {copy.aiValue}
          </span>
          <span className="text-[11px] text-muted-foreground">{copy.evidence}</span>
        </span>
      </div>
      <div className="border-t px-3.5 py-3">
        <p className="text-[11px] text-muted-foreground">{copy.actionsLabel}</p>
        <div className="relative mt-2 grid grid-cols-3 gap-1.5">
          {copy.actions.map((action, index) => (
            <span
              className={cn(
                "flex h-8 items-center justify-center truncate rounded-md border px-1.5 text-[11px]",
                index === 0
                  ? "border-foreground/80 bg-foreground font-medium text-background"
                  : "border-border text-foreground/75",
              )}
              key={action}
            >
              {action}
            </span>
          ))}
          <IconPointerFilled
            aria-hidden="true"
            className="absolute top-5 left-[30%] size-4 text-foreground drop-shadow-[0_1px_1px_rgb(255_255_255/0.9)]"
          />
        </div>
      </div>
      <p className="flex items-center gap-1.5 bg-muted/50 px-3.5 py-2.5 text-[11px] text-muted-foreground">
        <IconInfoCircle aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{copy.note}</span>
      </p>
    </LayeredFragment>
  );
}

function SourceExcerpt({
  after,
  before,
  highlight,
  label,
}: {
  after: string;
  before: string;
  highlight: string;
  label: string;
}) {
  return (
    <div className="border-border border-l-2 pl-2.5">
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-foreground/70 leading-relaxed">
        {before}
        <mark className="whitespace-nowrap rounded-[3px] bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-400/30">
          {highlight}
        </mark>
        {after}
      </p>
    </div>
  );
}

function SourceVisual() {
  const copy = getHomeDemoCopy().trust.source;
  const sourceIcons = [IconFileText, IconMicrophone];
  return (
    <LayeredFragment>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 font-medium text-[11px] text-emerald-700 dark:text-emerald-300">
          {copy.label}
        </span>
        <span className="truncate font-medium text-[13px]">{copy.claim}</span>
      </div>
      <div className="space-y-2.5 border-t px-3.5 py-3">
        <SourceExcerpt
          after={copy.after}
          before={copy.before}
          highlight={copy.highlight}
          label={copy.resumeLabel}
        />
        <SourceExcerpt {...copy.answer} />
      </div>
      <div className="flex gap-1.5 overflow-hidden border-t px-3.5 py-2.5">
        {copy.sources.map(([kind, location], index) => {
          const SourceIcon = sourceIcons[index] ?? IconFileText;
          return (
            <span
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground/75"
              key={kind}
            >
              <SourceIcon aria-hidden="true" className="size-3 text-muted-foreground" />
              {kind}
              <span className="text-muted-foreground">· {location}</span>
            </span>
          );
        })}
      </div>
    </LayeredFragment>
  );
}

const ACCESS_TONE = {
  full: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  none: "bg-muted text-muted-foreground",
  partial: "bg-primary/10 text-primary",
} as const;

function DataVisual() {
  const copy = getHomeDemoCopy().trust.data;
  return (
    <LayeredFragment>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <IconLock aria-hidden="true" className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-[13px]">{copy.workspace}</p>
          <p className="truncate text-[11px] text-muted-foreground">{copy.scope}</p>
        </div>
      </div>
      <ul className="divide-y divide-border/65 border-t">
        {copy.members.map(([name, role, access, level]) => (
          <li className="flex items-center gap-2 px-3.5 py-1.5" key={name}>
            {level === "none" ? (
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
                <IconUser aria-hidden="true" className="size-3" />
              </span>
            ) : (
              <Avatar className="size-6" label={name} seed={`interviewer:${name}`} size="sm">
                <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn("truncate font-medium", level === "none" && "text-muted-foreground")}
              >
                {name}
              </p>
              <p className="truncate text-[10.5px] text-muted-foreground">{role}</p>
            </div>
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]",
                ACCESS_TONE[level],
              )}
            >
              {level === "none" ? <IconLock aria-hidden="true" className="size-2.5" /> : null}
              {access}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 bg-muted/50 px-3.5 py-2 text-[11px] text-muted-foreground">
        <IconHistory aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{copy.footer}</span>
      </p>
    </LayeredFragment>
  );
}

function getCards(): BoundaryCardProps[] {
  return [
    {
      artwork: { palette: "lilac", pattern: "rays" },
      description: messages.home_trust_decision_description(),
      title: messages.home_trust_decision_title(),
      visual: <DecisionVisual />,
    },
    {
      artwork: { palette: "sky", pattern: "lens" },
      description: messages.home_trust_source_description(),
      title: messages.home_trust_source_title(),
      visual: <SourceVisual />,
    },
    {
      artwork: { palette: "moss", pattern: "contours" },
      description: messages.home_trust_data_description(),
      title: messages.home_trust_data_title(),
      visual: <DataVisual />,
    },
  ];
}

export function TrustBoundaries() {
  return (
    <Section id="trust">
      <SectionHeader lead={messages.home_trust_lead()} title={messages.home_trust_title()} />
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {getCards().map((card, index) => (
          <FadeContent className="h-full" delay={0.05 * index} key={card.title}>
            <BoundaryCard {...card} />
          </FadeContent>
        ))}
      </div>
    </Section>
  );
}
