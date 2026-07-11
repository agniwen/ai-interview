"use client";

import { IconHistory, IconRobot, IconUserCircle } from "@tabler/icons-react";
import type { CandidateTimelineEvent, CandidateTimelineResponse } from "@arc/shared/studio-resumes";
import type { ReactNode } from "react";

import { MarkdownView } from "@/components/features/display/markdown-view";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "@/components/ui/preview-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@arc/shared/utils";
import { formatRelativeTime } from "@arc/shared/utils/time";

const AI_REPORT_DESCRIPTION_MAX_LENGTH = 220;

function ActivityRecordShell({ avatar, content }: { avatar: ReactNode; content: ReactNode }) {
  return (
    <div className="flex min-w-0 max-w-full items-start gap-3">
      <div className="shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1 pt-0.5 text-sm leading-6">{content}</div>
    </div>
  );
}

export function CandidateTimelineSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("max-w-full overflow-hidden", className)}>
      <Skeleton className="h-5 w-24" />
      <div className="mt-5 flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <ActivityRecordShell
            avatar={<Skeleton className="size-5 rounded-full" />}
            content={
              <div className="flex min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden">
                <Skeleton className="h-4 w-16 shrink-0 rounded-full" />
                <Skeleton className="h-4 min-w-24 flex-1 rounded-full" />
                <Skeleton className="h-4 w-2 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-14 shrink-0 rounded-full" />
              </div>
            }
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

type CandidateTimelineDensity = "default" | "rail";
type CandidateTimelineScrollMode = "internal" | "page";

function truncateMarkdown(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function shouldRenderDescriptionAsMarkdown(event: CandidateTimelineEvent) {
  return event.title === "AI 报告同步";
}

interface ActivityActor {
  icon: "robot" | "user";
  image: string | null;
  name: string;
}

function getMetadataValue(event: CandidateTimelineEvent, label: string) {
  return event.metadata.find((item) => item.label === label)?.value;
}

function getActivityActor(event: CandidateTimelineEvent): ActivityActor {
  if (event.actorName) {
    return { icon: "user", image: event.actorImage, name: event.actorName };
  }

  if (event.kind === "form" || event.title === "候选人回复 Offer") {
    return { icon: "user", image: null, name: "候选人" };
  }

  if (event.kind === "ai_interview" || event.title.includes("AI")) {
    return { icon: "robot", image: null, name: "系统" };
  }

  return { icon: "robot", image: null, name: "系统" };
}

type ActivityFormatter = (event: CandidateTimelineEvent) => string;

function formatWithDescription(prefix: string, fallback: string): ActivityFormatter {
  return (event) => (event.description ? `${prefix}：${event.description}` : fallback);
}

function formatWithRound(verb: string): ActivityFormatter {
  return (event) => {
    const roundName = getMetadataValue(event, "轮次");
    return roundName ? `${verb}「${roundName}」` : verb;
  };
}

const ACTIVITY_FORMATTERS: Record<string, ActivityFormatter> = {
  "AI 报告同步": () => "同步 AI 面试报告",
  "AI 通话开始": () => "开始 AI 通话",
  "AI 面试中断": formatWithRound("中断 AI 面试"),
  "AI 面试已排期": formatWithRound("排期 AI 面试"),
  "AI 面试开始": formatWithRound("开始 AI 面试"),
  "AI 面试结束": formatWithRound("完成 AI 面试"),
  "Offer 已发送": () => "发送 Offer",
  "Offer 已撤回": () => "撤回 Offer",
  上下文已刷新: () => "刷新 AI 面试上下文",
  候选人入库: (event) => (event.description ? `创建候选人，${event.description}` : "创建候选人"),
  "候选人回复 Offer": (event) => {
    const status = getMetadataValue(event, "状态");
    return status ? `回复 Offer：${status}` : "回复 Offer";
  },
  候选人提交表单: (event) => {
    const jobName = getMetadataValue(event, "岗位");
    return jobName ? `提交岗位「${jobName}」的候选人表单` : "提交候选人表单";
  },
  候选人结案: (event) => {
    const conclusion = getMetadataValue(event, "结论");
    return conclusion ? `标记结案，结论为 ${conclusion}` : "标记结案";
  },
  候选人阶段流转: formatWithDescription("更新阶段", "更新候选人阶段"),
  关联岗位已变更: formatWithDescription("变更关联岗位", "变更关联岗位"),
  "创建 AI 面试轮次": formatWithRound("创建 AI 面试轮次"),
  "创建 Offer": () => "创建 Offer",
  创建真人复面: formatWithRound("创建真人复面"),
  "发起 AI 面试": formatWithDescription("发起 AI 面试", "发起 AI 面试"),
  报告通知发送失败: () => "发送报告通知失败",
  报告通知已发送: () => "发送报告通知",
  报告通知待发送: () => "等待发送报告通知",
  "更新 Offer": formatWithDescription("更新 Offer", "更新 Offer"),
  更新真人复面: formatWithDescription("更新真人复面", "更新真人复面"),
  真人复面取消: formatWithRound("取消真人复面"),
  真人复面完成: formatWithRound("完成真人复面"),
  真人复面已排期: formatWithRound("安排真人复面"),
  简历评估已提交: formatWithDescription("提交简历评估", "提交简历评估"),
  简历评估已重置: () => "重置简历评估",
  简历评估状态变更: formatWithDescription("更新简历评估", "更新简历评估"),
  重新激活候选人: formatWithDescription("重新激活候选人", "重新激活候选人"),
  面试邀约邮件发送失败: () => "发送面试邀约邮件失败",
  面试邀约邮件已发送: () => "发送面试邀约邮件",
  面试题草稿已生成: () => "生成面试题草稿",
};

function formatActivityEvent(event: CandidateTimelineEvent) {
  const formatter = ACTIVITY_FORMATTERS[event.title];
  if (formatter) {
    return formatter(event);
  }

  return event.description ? `${event.title}：${event.description}` : event.title;
}

function ActivityAvatar({ actor }: { actor: ActivityActor }) {
  const fallbackLabel = actor.name.slice(0, 1);
  let fallbackContent = fallbackLabel || <IconUserCircle className="size-3" />;

  if (actor.icon === "robot") {
    fallbackContent = <IconRobot className="size-3" />;
  }

  return (
    <Avatar className="size-5 bg-muted text-muted-foreground" size="sm">
      {actor.image ? <AvatarImage alt={actor.name} src={actor.image} /> : null}
      <AvatarFallback>{fallbackContent}</AvatarFallback>
    </Avatar>
  );
}

function ActivityPreview({ event, text }: { event: CandidateTimelineEvent; text: string }) {
  let descriptionContent = null;

  if (event.description) {
    descriptionContent = shouldRenderDescriptionAsMarkdown(event) ? (
      <MarkdownView
        className={cn(
          "max-h-60 min-w-0 max-w-full overflow-auto wrap-break-word text-muted-foreground text-sm",
          "[&_*]:max-w-full [&_a]:break-all [&_code]:break-all",
          "[&_p]:my-1 [&_p]:leading-normal [&_pre]:whitespace-pre-wrap",
        )}
        content={truncateMarkdown(event.description, AI_REPORT_DESCRIPTION_MAX_LENGTH)}
      />
    ) : (
      <p className="max-h-40 overflow-auto wrap-break-word text-muted-foreground text-sm leading-relaxed">
        {event.description}
      </p>
    );
  }

  return (
    <PreviewCardPopup align="start" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
      <div className="grid gap-3 p-4">
        <div className="min-w-0">
          <p className="font-medium text-sm leading-relaxed">{text}</p>
          <TimeDisplay
            className="mt-1 block text-muted-foreground text-xs"
            options={DATE_TIME_DISPLAY_OPTIONS}
            value={event.occurredAt}
          />
        </div>
        {descriptionContent}
        {event.metadata.length > 0 ? (
          <dl className="grid gap-2 border-border/60 border-t pt-3 text-xs">
            {event.metadata.map((item) => (
              <div className="grid grid-cols-[4rem_1fr] gap-2" key={`${event.id}:${item.label}`}>
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="min-w-0 wrap-break-word font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </PreviewCardPopup>
  );
}

function TimelineEventItem({ event }: { event: CandidateTimelineEvent }) {
  const actor = getActivityActor(event);
  const text = formatActivityEvent(event);
  const hasPreview = Boolean(event.description || event.metadata.length > 0);

  return (
    <li className="min-w-0 max-w-full">
      <ActivityRecordShell
        avatar={<ActivityAvatar actor={actor} />}
        content={
          <PreviewCard>
            <p className="flex min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden text-muted-foreground">
              <span className="shrink-0 font-medium text-foreground">{actor.name}</span>
              {hasPreview ? (
                <PreviewCardTrigger
                  render={
                    <button
                      aria-label={text}
                      className="min-w-0 truncate text-left text-foreground outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                    />
                  }
                >
                  {text}
                </PreviewCardTrigger>
              ) : (
                <span className="min-w-0 truncate text-foreground">{text}</span>
              )}
              <span className="shrink-0">·</span>
              <time className="shrink-0" dateTime={event.occurredAt}>
                {formatRelativeTime(event.occurredAt)}
              </time>
            </p>
            {hasPreview ? <ActivityPreview event={event} text={text} /> : null}
          </PreviewCard>
        }
      />
    </li>
  );
}

export function CandidateTimeline({
  className,
  data,
  density = "default",
  isLoading,
  scrollMode = "internal",
}: {
  className?: string;
  data: CandidateTimelineResponse | null | undefined;
  density?: CandidateTimelineDensity;
  isLoading: boolean;
  scrollMode?: CandidateTimelineScrollMode;
}) {
  const isRail = density === "rail";
  const canUseInternalScroll = isRail && scrollMode === "internal";

  if (isLoading) {
    return <CandidateTimelineSkeleton className={className} />;
  }

  const events = data?.events ?? [];

  return (
    <div
      className={cn(
        "max-w-full overflow-hidden",
        canUseInternalScroll && "xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-medium text-sm">活动记录</h3>
        </div>
      </div>

      {events.length === 0 ? (
        <Empty className="mt-5 min-h-48">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconHistory />
            </EmptyMedia>
            <EmptyTitle>暂无活动记录</EmptyTitle>
            <EmptyDescription>候选人产生面试、表单或阶段流转后会显示在这里。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol
          className={cn(
            "relative mt-5 flex min-w-0 max-w-full flex-col gap-4",
            canUseInternalScroll && "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1",
          )}
        >
          {events.map((event) => (
            <TimelineEventItem event={event} key={event.id} />
          ))}
        </ol>
      )}
    </div>
  );
}
