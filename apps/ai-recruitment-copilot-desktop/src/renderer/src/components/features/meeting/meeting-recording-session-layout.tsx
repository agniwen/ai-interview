import type { ReactNode } from "react";
import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@arc/shared/utils";

/**
 * Agent-style meeting recording shell: full-height scroll stage + floating bottom composer.
 * 会议录制页壳：主区占满并滚动，composer 浮在底部；main 在滚动内容末尾预留展示空间。
 */
export function MeetingRecordingSessionLayout({
  composer,
  main,
  className,
}: {
  composer?: ReactNode;
  main: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("relative flex w-full flex-col overflow-hidden", className)}
      style={{ height: `calc(100dvh - ${TITLE_BAR_HEIGHT_PX}px)` }}
    >
      <ScrollArea className="min-h-0 flex-1" orientation="vertical">
        <div className="h-full min-h-full pt-4">{main}</div>
      </ScrollArea>
      {composer ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-3 sm:px-6">
          <div className="pointer-events-auto mx-auto w-full max-w-lg">{composer}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bottom control pill — compact white surface with a soft border and elevation.
 * 底部控制条：紧凑白色表面、全圆角、细边框与轻阴影。中间区域自行横向滚动。
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
        "min-w-0 rounded-full border border-border/70 bg-background py-1 pr-1.5 pl-3.5 shadow-[0_2px_10px_rgb(0_0_0/0.07)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
