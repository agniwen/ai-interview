"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface StatusWordPair {
  present: string;
  past: string;
}

const STATUS_WORD_PAIRS: StatusWordPair[] = [
  { past: "已分析", present: "分析中" },
  { past: "已思考", present: "思考中" },
  { past: "已提取", present: "提取中" },
  { past: "已解析", present: "解析中" },
  { past: "已评估", present: "评估中" },
  { past: "已推理", present: "推理中" },
  { past: "已筛选", present: "筛选中" },
];

const UNSIGNED_INT_MODULO = 2 ** 32;

function resolveElapsedSeconds({
  durationMs,
  isStreaming,
  liveElapsed,
}: {
  durationMs: number | null | undefined;
  isStreaming: boolean;
  liveElapsed: number;
}) {
  if (isStreaming) {
    return liveElapsed;
  }
  if (durationMs === null || durationMs === undefined) {
    return liveElapsed;
  }
  return Math.max(0, Math.round(durationMs / 1000));
}

function hashString(value: string): number {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    const codePoint = value.codePointAt(i) ?? 0;
    hash = Math.trunc((hash * 31 + codePoint) % UNSIGNED_INT_MODULO);
  }

  return hash < 0 ? hash + UNSIGNED_INT_MODULO : hash;
}

function getStatusWordPair(seed: string | null): StatusWordPair {
  if (!seed) {
    return STATUS_WORD_PAIRS[0];
  }

  return STATUS_WORD_PAIRS[hashString(seed) % STATUS_WORD_PAIRS.length];
}

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins}m`;
  }
  return `${mins}m ${secs}s`;
}

function renderSegments(segments: string[]) {
  return segments.map((segment, i) => (
    <span key={i}>
      <span className="text-muted-foreground/40"> · </span>
      {segment}
    </span>
  ));
}

export function ToolCallsSummaryBar({
  isExpanded,
  onToggle,
  isStreaming,
  toolCallCount,
  durationMs,
  startedAt,
  statusWordSeed,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  isStreaming: boolean;
  toolCallCount: number;
  /** Final generation duration in ms (for completed messages). */
  durationMs: number | null;
  /** ISO timestamp of when generation started. */
  startedAt: string | null;
  /** Stable per-message seed used to choose a status word pair. */
  statusWordSeed: string | null;
}) {
  const startMs = startedAt ? new Date(startedAt).getTime() : null;

  const computeLiveElapsed = () =>
    startMs === null ? 0 : Math.max(0, Math.floor((Date.now() - startMs) / 1000));

  const [liveElapsed, setLiveElapsed] = useState(computeLiveElapsed);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    setLiveElapsed(computeLiveElapsed());
    const interval = setInterval(() => {
      setLiveElapsed(computeLiveElapsed());
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming, startMs]);

  const elapsedSeconds = resolveElapsedSeconds({ durationMs, isStreaming, liveElapsed });

  const statusWordPair = getStatusWordPair(statusWordSeed);
  const statusLabel = isStreaming ? `${statusWordPair.present}…` : statusWordPair.past;
  const toolCallLabel = toolCallCount > 0 ? `${toolCallCount} 次工具调用` : null;

  const desktopSegments: string[] = [];
  const mobileSegments: string[] = [];

  if (elapsedSeconds > 0) {
    const elapsedLabel = formatElapsedTime(elapsedSeconds);
    desktopSegments.push(elapsedLabel);
    mobileSegments.push(elapsedLabel);
  }

  if (toolCallLabel) {
    desktopSegments.push(toolCallLabel);
    mobileSegments.push(toolCallLabel);
  }

  const fullSummary = [statusLabel, ...desktopSegments].join(" · ");

  return (
    <div className="my-1.5 border border-transparent py-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-label={fullSummary}
        title={fullSummary}
        className={cn(
          "group flex w-full max-w-full items-center gap-2 rounded-md py-px text-left text-sm text-muted-foreground tabular-nums transition-colors hover:text-foreground sm:inline-flex sm:w-auto",
          isStreaming && "text-foreground/90",
        )}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              isStreaming ? "animate-pulse bg-muted-foreground" : "bg-muted-foreground/50",
            )}
          />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 overflow-hidden whitespace-nowrap leading-none sm:flex-none sm:overflow-visible sm:whitespace-normal",
            isStreaming && "animate-pulse motion-reduce:animate-none",
          )}
        >
          {statusLabel}
          {mobileSegments.length > 0 && (
            <span className="inline-block max-w-full truncate align-bottom sm:hidden">
              {renderSegments(mobileSegments)}
            </span>
          )}
          {desktopSegments.length > 0 && (
            <span className="hidden sm:inline">{renderSegments(desktopSegments)}</span>
          )}
        </span>
        <ChevronRight
          className={cn(
            "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-out motion-reduce:transition-none",
            isExpanded && "rotate-90",
          )}
        />
      </button>
    </div>
  );
}
