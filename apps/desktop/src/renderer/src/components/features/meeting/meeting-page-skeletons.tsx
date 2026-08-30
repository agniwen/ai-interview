import type { ReactNode } from "react";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FrameHeading,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MeetingComposerRow,
  MeetingRecordingSessionLayout,
} from "./meeting-recording-session-layout";

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
    <MeetingComposerRow slot="meeting-audio-player">
      <Skeleton className="size-8 shrink-0" />
      <Skeleton className="h-3 w-10 shrink-0" />
      <Skeleton className="h-8 min-w-0 flex-1" />
      <Skeleton className="h-3 w-10 shrink-0" />
      <Skeleton className="size-8 shrink-0" />
    </MeetingComposerRow>
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
          <FrameDescription>
            <Skeleton className="h-4 w-56" />
          </FrameDescription>
        </FrameHeading>
        {extraHeader}
      </FrameHeader>
      {panels}
    </Frame>
  );
}

function MetaFieldSkeleton({
  labelClassName,
  valueClassName,
}: {
  labelClassName: string;
  valueClassName: string;
}) {
  return (
    <div className="min-w-0">
      <Skeleton className={labelClassName} />
      <Skeleton className={`mt-1 ${valueClassName}`} />
    </div>
  );
}

export function MeetingSessionPageSkeleton() {
  return (
    <MeetingRecordingSessionLayout
      main={
        <div
          aria-busy="true"
          aria-label="正在加载录制会话"
          className="container mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 pb-10 sm:px-6"
          data-slot="meeting-session-skeleton"
        >
          <header className="flex flex-col gap-3 pr-12">
            <Skeleton className="h-7 w-52" />
          </header>
          <div className="grid">
            <TranscriptTurnSkeleton />
            <TranscriptTurnSkeleton wide={false} />
            <TranscriptTurnSkeleton />
            <TranscriptTurnSkeleton wide={false} />
          </div>
        </div>
      }
      overlay={<Skeleton className="absolute top-4 right-4 z-20 h-7 w-8 rounded-md" />}
      scrollFade
    />
  );
}

export function MeetingMorePageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载录制详情"
      className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-4 pb-10 sm:px-6"
      data-slot="meeting-more-skeleton"
    >
      <Frame>
        <FrameHeader className="justify-between gap-3">
          <FrameHeading>
            <FrameTitle>
              <Skeleton className="h-5 w-40" />
            </FrameTitle>
          </FrameHeading>
          <Skeleton className="h-5 w-14 shrink-0" />
        </FrameHeader>
        <FramePanel>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <MetaFieldSkeleton labelClassName="h-3 w-10" valueClassName="h-4 w-20" />
            <MetaFieldSkeleton labelClassName="h-3 w-8" valueClassName="h-4 w-14" />
            <MetaFieldSkeleton labelClassName="h-3 w-16" valueClassName="h-4 w-28" />
            <MetaFieldSkeleton labelClassName="h-3 w-16" valueClassName="h-4 w-28" />
          </dl>
        </FramePanel>
        <FramePanel>
          <PlaybackBarSkeleton />
        </FramePanel>
      </Frame>
      <MoreSectionSkeleton
        panels={
          <FramePanel className="flex flex-col gap-4">
            <div className="min-w-0">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1 h-3 w-40" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Skeleton className="h-9 min-w-0 flex-1" />
              <Skeleton className="h-9 w-20 shrink-0" />
            </div>
          </FramePanel>
        }
        titleClassName="h-5 w-16"
      />
      <MoreSectionSkeleton
        panels={
          <FramePanel className="flex flex-col gap-4">
            <div className="rounded-lg bg-muted/40 px-3 py-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          </FramePanel>
        }
        titleClassName="h-5 w-16"
      />
      <MoreSectionSkeleton
        extraHeader={<Skeleton className="h-8 w-20 shrink-0" />}
        headerClassName="justify-between gap-3"
        panels={
          <>
            <FramePanel className="flex flex-col gap-4">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </FramePanel>
            <FramePanel>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-8 w-16 self-end" />
              </div>
            </FramePanel>
          </>
        }
        titleClassName="h-5 w-16"
      />
      <MoreSectionSkeleton
        panels={
          <>
            <FramePanel className="flex flex-col gap-3">
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <Skeleton className="mb-2 h-3 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </div>
            </FramePanel>
            <FramePanel>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-8 w-20" />
              </div>
            </FramePanel>
          </>
        }
        titleClassName="h-5 w-16"
      />
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
      <MoreSectionSkeleton
        panels={
          <FramePanel className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-4 max-w-md flex-1" />
            <Skeleton className="h-8 w-16 shrink-0" />
          </FramePanel>
        }
        titleClassName="h-5 w-20"
      />
    </div>
  );
}
