import type { ReactNode } from "react";
import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";
import { cn } from "@arc/shared/utils";

/**
 * Agent-style meeting recording shell: scrollable main stage + fixed bottom composer.
 * 会议录制页壳：上方可滚动主区（字幕），底部固定 composer（电平 + 开始/结束）。
 */
export function MeetingRecordingSessionLayout({
  composer,
  main,
  className,
}: {
  composer: ReactNode;
  main: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("relative mx-auto flex w-full max-w-3xl flex-col overflow-hidden", className)}
      style={{ height: `calc(100dvh - ${TITLE_BAR_HEIGHT_PX}px)` }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3 sm:px-6">{main}</div>
      <div className="shrink-0 px-4 pt-2 pb-3 sm:px-6">
        <div className="mx-auto w-full max-w-2xl">{composer}</div>
      </div>
    </div>
  );
}

/**
 * Bottom control pill — fully rounded, border only.
 * 底部控制条：全圆角、仅边框。中间区域自行横向滚动，外层勿裁切滚动条。
 */
export function MeetingRecordingComposerFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-full border border-border bg-border/80 py-1 pr-1.5 pl-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
