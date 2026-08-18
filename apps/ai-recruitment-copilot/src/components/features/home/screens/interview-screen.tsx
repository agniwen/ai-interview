import {
  IconChevronDown,
  IconMessage2,
  IconMicrophone,
  IconPhoneOff,
  IconUser,
  IconVideo,
} from "@tabler/icons-react";
// 用途：landing 用「语音面试 · 进行中」简化版 UI，对齐真实 AgentSessionView_01：
// - 顶层 fade gradient + 居中 agent 可视化器 (Aura) + 右下角候选人摄像头 tile
// - AgentStateIndicator: dot (animate-ping) + label "面试官正在讲话"
// - AgentControlBar (livekit variant): rounded-[31px] bg-background border + tools 左侧 +
//   AgentTrackControl (2-button group, rounded-l-full / rounded-r-full) + Disconnect rounded-full font-mono
// Purpose: simplified mid-interview UI mirroring AgentSessionView_01 + livekit AgentControlBar.

import { Badge } from "@/components/ui/badge";
import { ScreenFrame } from "./screen-frame";

// 主舞台使用当前 AgentAudioVisualizerAura，而不是旧版音量柱。
function AgentAudioAura() {
  return (
    <div className="relative grid size-[310px] place-items-center">
      <style>{`
        @keyframes audio-aura {
          0%, 100% { transform: scale(.92) rotate(-5deg); opacity: .62; }
          50% { transform: scale(1.04) rotate(5deg); opacity: .9; }
        }
      `}</style>
      <span
        aria-hidden="true"
        className="absolute size-[290px] rounded-[48%] bg-[radial-gradient(circle_at_35%_35%,color-mix(in_oklch,var(--primary)_55%,transparent),transparent_62%)] blur-xl"
        style={{ animation: "audio-aura 3.2s ease-in-out infinite" }}
      />
      <span
        aria-hidden="true"
        className="absolute size-[220px] rounded-[44%] bg-[radial-gradient(circle_at_65%_60%,color-mix(in_oklch,var(--chart-2)_48%,transparent),transparent_68%)] blur-md"
        style={{ animation: "audio-aura 2.6s ease-in-out -1s infinite reverse" }}
      />
      <span className="relative size-16 rounded-full bg-primary/25" />
    </div>
  );
}

// ─────────────── Candidate camera tile ───────────────
function CandidateCameraTile() {
  return (
    <div className="absolute right-12 bottom-[210px] z-30 aspect-square size-[90px] overflow-hidden rounded-md bg-muted drop-shadow-lg/20">
      <div className="grid size-full place-items-center bg-muted">
        <IconUser className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
    </div>
  );
}

// ─────────────── Agent state indicator ───────────────
function AgentStateIndicator() {
  // 真实 AgentStateIndicator (speaking): 居中 + size-2.5 绿点 animate-ping + label "面试官正在讲话"
  return (
    <div className="-translate-x-1/2 absolute bottom-[170px] left-1/2 z-30 flex items-center justify-center gap-2 font-medium text-muted-foreground text-sm">
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/35 opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500/55" />
      </span>
      <span>面试官正在讲话</span>
    </div>
  );
}

// ─────────────── Track control: 2-button group (toggle + chevron) ───────────────
interface TrackControlProps {
  icon: React.ReactNode;
  enabled?: boolean;
  // off 态在 livekit variant 下变 destructive 红
  // off → red destructive style (mic muted etc.)
  ariaLabel: string;
}

function TrackControl({ icon, enabled = true, ariaLabel }: TrackControlProps) {
  // 真实 LK_TOGGLE_VARIANT_1 (mic/camera):
  //   on (data-state=on): default 灰 + foreground 字
  //   off (data-state=off): bg-accent text-destructive/75 border-border
  // 2 个按钮拼接: 主 toggle (rounded-l-full) + 设备 chevron (rounded-r-full)
  const baseClass = enabled
    ? "bg-accent/40 text-foreground hover:bg-accent"
    : "bg-accent text-destructive/75";
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex h-10 items-stretch overflow-hidden rounded-full border border-border"
    >
      <span
        className={`flex items-center gap-1.5 rounded-l-full border-border/0 px-3.5 text-sm ${baseClass}`}
      >
        {icon}
      </span>
      <span className="w-px shrink-0 bg-border" />
      <span className={`grid place-items-center rounded-r-full px-2 ${baseClass}`}>
        <IconChevronDown className="size-3.5 opacity-60" />
      </span>
    </div>
  );
}

// ─────────────── Chat toggle (LK variant 2 — pressed=blue) ───────────────
function ChatToggle() {
  // 真实 LK_TOGGLE_VARIANT_2 (chat toggle):
  //   off: bg-accent text-foreground border-border
  //   on:  bg-blue-500/20 text-blue-700 border-blue-700/10
  return (
    <span
      aria-label="Toggle transcript"
      className="grid h-10 w-10 place-items-center rounded-full border border-border bg-accent/40 text-foreground hover:bg-accent"
    >
      <IconMessage2 className="size-4" />
    </span>
  );
}

// ─────────────── Disconnect button ───────────────
function DisconnectButton() {
  // 真实: bg-destructive/5 text-destructive/80 hover:bg-destructive/20 rounded-full font-mono text-xs font-bold tracking-wider
  return (
    <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-destructive/5 px-4 font-bold font-mono text-destructive/80 text-xs tracking-wider">
      <IconPhoneOff className="size-3.5" />
      结束面试
    </span>
  );
}

// ─────────────── Control bar (real livekit variant) ───────────────
function ControlBar() {
  // 真实 AgentControlBar:
  // outer: bg-background border-input/50 dark:border-muted flex flex-col border p-3 drop-shadow-md/3 rounded-[31px]
  // inner row: justify-between (tools-group + leave button)
  return (
    <div className="-translate-x-1/2 absolute bottom-6 left-1/2 z-50 w-fit">
      <div className="flex flex-col rounded-[31px] border border-input/50 bg-background p-3 dark:border-muted">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrackControl
              ariaLabel="Toggle microphone"
              icon={<IconMicrophone className="size-4" />}
            />
            <TrackControl ariaLabel="Toggle camera" icon={<IconVideo className="size-4" />} />
            <ChatToggle />
          </div>
          <DisconnectButton />
        </div>
      </div>
    </div>
  );
}

// ─────────────── Theme toggle (top-right) ───────────────
function ThemeMoonIcon() {
  return (
    <svg fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function InterviewCanvas() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
      {/* Top-left: AgentSpeechTimer */}
      <Badge className="absolute top-4 left-4 z-30 tabular-nums backdrop-blur" variant="outline">
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500/55" />
        00:42
      </Badge>

      {/* Top-right: ThemeToggle */}
      <div className="absolute top-4 right-4 z-30">
        <span className="grid size-8 place-items-center rounded-md text-muted-foreground">
          <ThemeMoonIcon />
        </span>
      </div>

      {/* Top fade gradient — mirrors <Fade top /> */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 z-10 h-40 bg-gradient-to-b from-background to-transparent"
      />

      {/* Center stage: agent aura visualizer */}
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <AgentAudioAura />
      </div>

      {/* Bottom-right: candidate camera tile */}
      <CandidateCameraTile />

      {/* Above control bar: state indicator */}
      <AgentStateIndicator />

      {/* Bottom: control bar */}
      <ControlBar />
    </div>
  );
}

export function InterviewScreen({ className }: { className?: string }) {
  return (
    <ScreenFrame className={className}>
      <InterviewCanvas />
    </ScreenFrame>
  );
}
