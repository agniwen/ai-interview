import type { ReactNode } from "react";
import { SettingsGroup } from "@/components/settings/settings-ui";
import { Frame, FrameHeader, FrameHeading, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";

function TranscriptTurnSkeleton({ wide = true }: { wide?: boolean }) {
  return (
    <article className="grid gap-1 rounded-sm px-px py-1">
      <Skeleton className="h-3 w-14" />
      <Skeleton className={`h-4 ${wide ? "w-full" : "w-4/5"}`} />
      <Skeleton className="h-4 w-2/3" />
    </article>
  );
}

function PlaybackBarSkeleton() {
  return (
    <div className="grid min-w-0 gap-3 px-3 pb-1" data-slot="meeting-audio-player">
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-[4.8rem] rounded-full" />
        <Skeleton className="h-10 w-[3.2rem] justify-self-end rounded-full" />
      </div>
    </div>
  );
}

function MoreSectionSkeleton({
  extraHeader,
  headerClassName,
  panels,
  titleClassName = "h-5 w-24",
}: {
  extraHeader?: ReactNode;
  headerClassName?: string;
  panels: ReactNode;
  titleClassName?: string;
}) {
  return (
    <Frame>
      <FrameHeader className={headerClassName}>
        <FrameHeading>
          <FrameTitle>
            <Skeleton className={titleClassName} />
          </FrameTitle>
        </FrameHeading>
        {extraHeader}
      </FrameHeader>
      {panels}
    </Frame>
  );
}

function SettingsRowSkeleton({
  action = false,
  description = false,
}: {
  action?: boolean;
  description?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <Skeleton className="h-4 w-16" />
        {description ? <Skeleton className="mt-1 h-3 w-32" /> : null}
      </div>
      <Skeleton
        className={action ? "h-8 w-16 sm:ml-auto" : "h-4 w-28 sm:min-w-[14rem] sm:max-w-xs"}
      />
    </div>
  );
}

export function MeetingSessionPageSkeleton() {
  return (
    <MeetingRecordingSessionLayout
      header={
        <header className="flex flex-col gap-3 pr-12">
          <Skeleton className="h-7 w-52" />
        </header>
      }
      main={
        <div
          aria-busy="true"
          aria-label="正在加载录制会话"
          className="container mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 pb-10 sm:px-6"
          data-slot="meeting-session-skeleton"
        >
          <div className="grid">
            <TranscriptTurnSkeleton />
            <TranscriptTurnSkeleton wide={false} />
            <TranscriptTurnSkeleton />
            <TranscriptTurnSkeleton wide={false} />
          </div>
        </div>
      }
      overlay={<Skeleton className="absolute top-12 right-4 z-20 h-7 w-8 rounded-md" />}
      scrollFade
    />
  );
}

export function MeetingMorePageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载录制详情"
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-8 pb-10 sm:px-6"
      data-slot="meeting-more-skeleton"
    >
      <Skeleton className="h-7 w-40" />
      <SettingsGroup>
        <SettingsRowSkeleton />
        <SettingsRowSkeleton />
        <SettingsRowSkeleton description />
        <SettingsRowSkeleton />
        <SettingsRowSkeleton description />
        <SettingsRowSkeleton action description />
      </SettingsGroup>
      <PlaybackBarSkeleton />
      <MoreSectionSkeleton
        panels={
          <FramePanel className="flex flex-col gap-3">
            <div className="grid">
              <TranscriptTurnSkeleton />
              <TranscriptTurnSkeleton wide={false} />
              <TranscriptTurnSkeleton />
            </div>
          </FramePanel>
        }
        titleClassName="h-5 w-16"
      />
    </div>
  );
}
