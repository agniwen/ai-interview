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

import { ScreenFrame } from "./screen-frame";

// ─────────────── Agent audio visualizer (bars) ───────────────
// 对齐真实 AgentAudioVisualizerBar：横排等宽圆角竖条，各条高度独立 scaleY 起伏
// 模拟 useMultibandTrackVolume 的实时音量分布。
// Mirrors the real AgentAudioVisualizerBar: row of rounded bars whose scaleY
// animates with offset delays to mimic real-time audio levels.
const BAR_DELAYS = [-0.2, -0.6, -0.1, -0.45, 0, -0.35, -0.15, -0.5, -0.25];

function AgentAudioBars() {
  return (
    <div className="relative flex h-[220px] items-center justify-center gap-3">
      {/* keyframes 内联：避免改全局 globals.css */}
      <style>{`
        @keyframes audio-bar {
          0%, 100% { transform: scaleY(0.18); }
          50%      { transform: scaleY(1); }
        }
      `}</style>
      {BAR_DELAYS.map((delay, i) => (
        <span
          aria-hidden="true"
          className="block w-7 origin-center rounded-full bg-primary/45"
          // biome-ignore lint/suspicious/noArrayIndexKey: stable decorative bars
          key={i}
          style={{
            animation: "audio-bar 1.4s ease-in-out infinite",
            animationDelay: `${delay}s`,
            height: "180px",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────── Candidate camera tile ───────────────
function CandidateCameraTile() {
  // 真实 TileLayout 在 chat 关闭时把第二个 tile 放在 col-start-2 row-start-3 place-content-end，
  // 也就是右下角靠下；这里用绝对定位放右下角，尺寸贴近真实小窗。
  return (
    <div className="absolute right-6 bottom-[180px] z-30 h-[140px] w-[200px] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-700 to-slate-900 shadow-xl ring-1 ring-black/10">
      <div className="-translate-x-1/2 absolute bottom-[-32px] left-1/2 grid size-[110px] place-items-center rounded-full bg-slate-600/60">
        <IconUser className="size-10 text-slate-400" strokeWidth={1.5} />
      </div>
      <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 font-medium text-[10px] text-white backdrop-blur">
        <span className="size-1.5 animate-pulse rounded-full bg-rose-500/45" />你
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
      <div className="flex flex-col rounded-[31px] border border-input/50 bg-background p-3 shadow-md/30 dark:border-muted">
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
      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 rounded-md border border-border bg-background/80 px-2.5 py-1 font-mono text-[11px] tabular-nums backdrop-blur">
        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500/55" />
        00:42
      </div>

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
        <AgentAudioBars />
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
