"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { cn } from "@/lib/utils";

// 3×3 像素格按列错峰点亮，形成从左向右推进的节奏。
const pixelCells = [90, 180, 270, 0, 90, 180, 90, 180, 270].map((delayMs, index) => ({
  delayMs,
  id: `pixel-${index}`,
}));
const elapsedTickMs = 100;

// AI SDK 消息每次流式更新都会生成新的 createdAt，不能作为计时起点。
// 线程持有本轮运行的计时起点：第一个挂载的指示器写入，之后线程末尾与
// 助手消息内的指示器共用；运行结束时清空。
export const ThinkingClockContext = createContext<RefObject<number | null> | null>(null);

export function useThinkingClock(isRunning: boolean) {
  const clock = useRef<number | null>(null);
  useEffect(() => {
    if (!isRunning) {
      clock.current = null;
    }
  }, [isRunning]);
  return clock;
}

function formatElapsed(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RecruitingThinkingIndicator({
  className,
  label = "思考中",
}: {
  className?: string;
  label?: string;
}) {
  const clock = useContext(ThinkingClockContext);
  const [startedAt] = useState(() => {
    if (!clock) {
      return Date.now();
    }
    clock.current ??= Date.now();
    return clock.current;
  });
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - startedAt));

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), elapsedTickMs);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <output className={cn("aui-assistant-working flex w-fit items-center gap-2.5", className)}>
      <span aria-hidden="true" className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
        {pixelCells.map((cell) => (
          <span
            className="ai-pixel-loader-cell size-1 rounded-[1px] bg-foreground"
            key={cell.id}
            style={{ animationDelay: `${cell.delayMs}ms` }}
          />
        ))}
      </span>
      <span className="ai-loading-shimmer-text font-medium text-sm">{label}</span>
      <span aria-hidden="true" className="font-mono text-muted-foreground text-xs tabular-nums">
        {formatElapsed(elapsedMs)}
      </span>
    </output>
  );
}
