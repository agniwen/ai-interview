"use client";

import type {
  StudioAiCalendarEvent,
  StudioAiCalendarEventPreview,
} from "@app/shared/studio-calendar";
import { scheduleEntryStatusMeta } from "@app/db-schema/studio-interviews";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import type { ReactElement } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { fetchStudioAiCalendarEventPreview } from "@/lib/client/api/endpoints/studio-calendar";
import { studioCalendarKeys } from "@/lib/client/api/query-keys";

interface AiInterviewEventHoverCardDependencies {
  fetchPreview: typeof fetchStudioAiCalendarEventPreview;
  renderNavigation: (args: { candidateId: string; roundId: string; slug: string }) => ReactElement;
}

const defaultAiInterviewEventHoverCardDependencies: AiInterviewEventHoverCardDependencies = {
  fetchPreview: fetchStudioAiCalendarEventPreview,
  renderNavigation: ({ candidateId, roundId, slug }) => (
    <div className="flex justify-end gap-1 border-border/70 border-t pt-2">
      <Link
        className={buttonVariants({ size: "xs", variant: "ghost" })}
        params={{ recordId: candidateId, slug }}
        search={{ tab: "rounds" }}
        to="/w/$slug/studio/resumes/$recordId"
      >
        查看候选人
      </Link>
      <Link
        className={buttonVariants({ size: "xs", variant: "outline" })}
        params={{ slug }}
        search={{ roundId }}
        to="/w/$slug/studio/interviews"
      >
        查看面试
      </Link>
    </div>
  ),
};

function formatDateTime(value: string | null): string {
  return value ? format(new Date(value), "M月d日 HH:mm") : "未记录";
}

function formatDuration(durationSecs: number | null): string {
  if (durationSecs === null) {
    return "时长未记录";
  }
  const minutes = Math.max(1, Math.round(durationSecs / 60));
  return `${minutes} 分钟`;
}

function reportStatusText(result: NonNullable<StudioAiCalendarEventPreview["result"]>): string {
  if (result.reportStatus === "failed") {
    return "报告生成失败";
  }
  if (result.reportStatus === "running") {
    return "报告生成中";
  }
  if (result.reportStatus === "pending") {
    return "报告待生成";
  }
  return result.summary?.trim() || "暂无面试总结。";
}

function reportStatusLabel(
  status: NonNullable<StudioAiCalendarEventPreview["result"]>["reportStatus"],
) {
  return {
    failed: "生成失败",
    pending: "待生成",
    ready: "已生成",
    running: "生成中",
  }[status];
}

function roundStatusMeta(status: StudioAiCalendarEventPreview["round"]["status"]) {
  return status === "interrupted"
    ? ({ label: "连接中断", tone: "warning" } as const)
    : scheduleEntryStatusMeta[status];
}

function PreviewSkeleton({ source }: { source: StudioAiCalendarEvent["source"] }) {
  const detailRows = source === "result" ? 5 : 3;

  return (
    <output
      aria-label="正在加载 AI 面试详情"
      className="flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-3"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        {Array.from({ length: detailRows }, (_, index) => (
          <div className="contents" key={index}>
            <Skeleton className="h-4 w-14" />
            <Skeleton className={index % 2 === 0 ? "h-4 w-40" : "h-4 w-48"} />
          </div>
        ))}
      </div>
      <div className="space-y-2 border-border/70 border-t pt-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex justify-end gap-1 border-border/70 border-t pt-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-20" />
      </div>
    </output>
  );
}

function PreviewContent({
  preview,
  renderNavigation,
  source,
  slug,
}: {
  preview: StudioAiCalendarEventPreview;
  renderNavigation: AiInterviewEventHoverCardDependencies["renderNavigation"];
  source: StudioAiCalendarEvent["source"];
  slug: string;
}) {
  const status = roundStatusMeta(preview.round.status);
  const { result } = preview;
  const startAt = result?.startedAt ?? preview.round.scheduledAt;
  const endAt = result?.endedAt ?? preview.round.scheduledEndAt;

  return (
    <div className="flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-sm">{preview.candidate.name}</h3>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {source === "result" ? "AI 面试记录" : "AI 面试计划"} · {preview.round.label}
          </p>
        </div>
        <Badge className="shrink-0" variant={status.tone}>
          {status.label}
        </Badge>
      </div>

      <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">在招岗位</dt>
        <dd className="truncate">{preview.candidate.jobDescriptionName || "未关联"}</dd>
        <dt className="text-muted-foreground">目标职位</dt>
        <dd className="truncate">{preview.candidate.targetRole || "未填写"}</dd>
        <dt className="text-muted-foreground">{result ? "实际时间" : "计划时间"}</dt>
        <dd>
          {formatDateTime(startAt)} – {formatDateTime(endAt)}
        </dd>
        {result ? (
          <>
            <dt className="text-muted-foreground">面试数据</dt>
            <dd>
              {formatDuration(result.durationSecs)} · {result.turnCount} 轮对话
            </dd>
          </>
        ) : null}
        {preview.round.status === "interrupted" ? (
          <>
            <dt className="text-muted-foreground">连接状态</dt>
            <dd>已中断 · {formatDateTime(preview.round.disconnectedAt)}</dd>
          </>
        ) : null}
        {result ? (
          <>
            <dt className="text-muted-foreground">报告状态</dt>
            <dd>{reportStatusLabel(result.reportStatus)}</dd>
          </>
        ) : null}
      </dl>

      {result ? (
        <section className="border-border/70 border-t pt-3">
          <h4 className="mb-1 font-medium text-muted-foreground text-xs">面试总结</h4>
          <p className="line-clamp-3 text-sm leading-5">{reportStatusText(result)}</p>
        </section>
      ) : (
        <p className="border-border/70 border-t pt-3 text-muted-foreground text-xs">
          {preview.round.allowTextInput ? "允许候选人使用文字输入" : "仅支持语音面试"}
        </p>
      )}

      {renderNavigation({ candidateId: preview.candidate.id, roundId: preview.round.id, slug })}
    </div>
  );
}

export function AiInterviewEventHoverCard({
  event,
  slug,
  trigger,
  dependencies = defaultAiInterviewEventHoverCardDependencies,
}: {
  dependencies?: AiInterviewEventHoverCardDependencies;
  event: StudioAiCalendarEvent;
  slug: string;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [candidate] = event.candidates;
  const roundId = candidate?.roundId ?? "";
  const { conversationId } = event;
  const previewQuery = useQuery({
    enabled: open && roundId.length > 0,
    queryFn: () => dependencies.fetchPreview(slug, roundId, conversationId),
    queryKey: studioCalendarKeys.aiEventPreview(slug, roundId, conversationId),
    staleTime: 60_000,
  });

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        closeDelay={200}
        data-calendar-event-preview="ai"
        delay={350}
        render={trigger}
      />
      <HoverCardContent
        align="start"
        className="w-auto p-4"
        onClick={(pointerEvent) => pointerEvent.stopPropagation()}
        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
        side="top"
        sideOffset={8}
      >
        {previewQuery.isPending || previewQuery.data ? (
          <SkeletonReveal
            loading={previewQuery.isPending}
            skeleton={<PreviewSkeleton source={event.source} />}
          >
            {previewQuery.data ? (
              <PreviewContent
                preview={previewQuery.data}
                renderNavigation={dependencies.renderNavigation}
                slug={slug}
                source={event.source}
              />
            ) : null}
          </SkeletonReveal>
        ) : null}
        {previewQuery.isError || previewQuery.data === null ? (
          <div className="w-72 text-sm">
            <p className="font-medium">{candidate?.candidateName ?? event.title}</p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {event.source === "result" ? "AI 面试记录" : "AI 面试计划"} · {event.title}
            </p>
            <p className="mt-1 text-muted-foreground">AI 面试详情加载失败，请稍后重试。</p>
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
