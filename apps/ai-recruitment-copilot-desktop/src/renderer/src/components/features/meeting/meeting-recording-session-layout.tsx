import type { ReactNode } from "react";
import { TITLE_BAR_HEIGHT_PX } from "@/components/layout/chrome";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@arc/shared/utils";

/**
 * Agent-style recording shell: full-height scroll stage + floating bottom composer.
 * 录制页壳：主区占满并滚动，composer 浮在底部；main 在滚动内容末尾预留展示空间。
 */
export function MeetingRecordingSessionLayout({
  composer,
  main,
  className,
  overlay,
  scrollFade,
}: {
  composer?: ReactNode;
  main: ReactNode;
  className?: string;
  overlay?: ReactNode;
  scrollFade?: boolean;
}) {
  return (
    <div
      className={cn("@container relative flex w-full flex-col overflow-hidden", className)}
      data-slot="meeting-session-layout"
      style={{ height: `calc(100dvh - ${TITLE_BAR_HEIGHT_PX}px)` }}
    >
      {overlay}
      <ScrollArea className="min-h-0 flex-1" orientation="vertical" scrollFade={scrollFade}>
        <div className="h-full min-h-full pt-4">{main}</div>
      </ScrollArea>
      {composer ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-5 sm:px-6">
          <div className="pointer-events-auto mx-auto w-full max-w-lg">{composer}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Shared radius for the floating bar, inner chips, and end-cap actions. */
export const MEETING_COMPOSER_RADIUS = "rounded-xl";
export const MEETING_COMPOSER_ACTION_CLASS = cn("shrink-0", "rounded-md");

/**
 * Shared floating-bar chrome used by record, setup, interrupt, and playback composers.
 * 录制/新建/回放共用的底部条外壳：同一边距、圆角和阴影。
 */
export function MeetingComposerFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border border-border/70 bg-background p-1.5 shadow-[0_4px_6px_-4px_rgb(0_0_0/0.06)]",
        MEETING_COMPOSER_RADIUS,
        className,
      )}
      data-slot="meeting-composer-frame"
    >
      {children}
    </div>
  );
}

/** Inner row: 32px controls aligned to the playback bar. */
export function MeetingComposerRow({
  children,
  className,
  slot = "meeting-composer-row",
}: {
  children: ReactNode;
  className?: string;
  slot?: string;
}) {
  return (
    <div className={cn("flex h-8 min-w-0 items-center gap-2", className)} data-slot={slot}>
      {children}
    </div>
  );
}
