import type { ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@app/shared/utils";

/**
 * Recording shell: the main stage owns scrolling while the bottom composer stays in normal flow.
 * 录制页壳：主区独立滚动，底部 composer 固定占位，内容不会从操作区下方穿过。
 */
export function MeetingRecordingSessionLayout({
  composer,
  composerClassName,
  header,
  main,
  className,
  overlay,
  scrollFade,
}: {
  composer?: ReactNode;
  composerClassName?: string;
  header?: ReactNode;
  main: ReactNode;
  className?: string;
  overlay?: ReactNode;
  scrollFade?: boolean;
}) {
  return (
    <div
      className={cn("@container relative flex h-dvh w-full flex-col overflow-hidden", className)}
      data-slot="meeting-session-layout"
    >
      {overlay}
      {header ? (
        <div
          className="container mx-auto w-full max-w-3xl shrink-0 px-4 pt-8 pb-3 sm:px-6"
          data-slot="meeting-session-header"
        >
          {header}
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" orientation="vertical" scrollFade={scrollFade}>
        <div
          className={cn("box-border h-full min-h-full", !header && "pt-8")}
          data-slot="meeting-session-scroll-content"
        >
          {main}
        </div>
      </ScrollArea>
      {composer ? (
        <div
          className="shrink-0 bg-background px-4 pt-2 pb-5 sm:px-6"
          data-slot="meeting-session-action"
        >
          <div className={cn("mx-auto w-full max-w-lg", composerClassName)}>{composer}</div>
        </div>
      ) : null}
    </div>
  );
}
