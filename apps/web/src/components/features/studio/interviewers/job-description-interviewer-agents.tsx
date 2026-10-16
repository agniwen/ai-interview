"use client";

import { Blobatar } from "@blobatar/react";
import { getMinimaxVoiceMeta } from "@app/db-schema/minimax-voices";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import { IconMicrophone } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import { MarkdownView } from "@/components/features/display/markdown-view";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

// 与服务端列表接口的 pageSize 上限一致；单个岗位的面试官远少于此。Server max page size.
const JOB_INTERVIEWERS_PAGE_SIZE = 100;
const CHIP_AVATAR_SIZE = 20;
const CARD_AVATAR_SIZE = 40;

function InterviewerAgentPreview({ record }: { record: InterviewerListRecord }) {
  const voiceMeta = getMinimaxVoiceMeta(record.voice);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Blobatar
          alt=""
          className="shrink-0 rounded-lg"
          name={record.name}
          size={CARD_AVATAR_SIZE}
        />
        <div className="min-w-0">
          <h3 className="wrap-break-word font-medium text-sm leading-5">{record.name}</h3>
          <p className="truncate text-muted-foreground text-xs">
            {record.departmentName ?? "未知部门"}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-1.5 text-xs">
        <IconMicrophone aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">{voiceMeta?.label ?? record.voice}</p>
          {voiceMeta?.description ? (
            <p className="text-muted-foreground">{voiceMeta.description}</p>
          ) : null}
        </div>
      </div>
      {record.description ? (
        <p className="text-muted-foreground text-sm">{record.description}</p>
      ) : null}
      <section className="flex flex-col gap-1">
        <h4 className="font-medium text-muted-foreground text-xs">人设 Prompt</h4>
        <ScrollArea className="max-h-40 [--scroll-fade-reveal:1rem]" scrollFade>
          <MarkdownView className="pr-3 text-sm" content={record.prompt.trim() || "未填写"} />
        </ScrollArea>
      </section>
      <p className="border-t pt-2 text-muted-foreground text-xs">
        被 {record.jobDescriptionCount} 个岗位引用
      </p>
    </div>
  );
}

function InterviewerAgentChip({ record }: { record: InterviewerListRecord }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-0.5 ps-0.5 pe-2.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            type="button"
          >
            <Blobatar
              alt=""
              className="shrink-0 rounded-full"
              name={record.name}
              size={CHIP_AVATAR_SIZE}
            />
            <span className="truncate">{record.name}</span>
          </button>
        }
      />
      <HoverCardContent align="start" className="w-80 max-w-[calc(100vw-2rem)]" sideOffset={8}>
        <InterviewerAgentPreview record={record} />
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * 列出岗位当前配置的面试官 Agent，悬停查看部门、音色与人设。
 * Lists the interviewer agents configured on a job; hovering a chip previews its details.
 */
export function JobDescriptionInterviewerAgents({
  jobDescriptionId,
  slug,
}: {
  jobDescriptionId: string;
  slug: string;
}) {
  const { data, isError, isPending } = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.interviewers.$get({
          param: { slug },
          query: {
            jobDescriptionId,
            pageSize: String(JOB_INTERVIEWERS_PAGE_SIZE),
            sortBy: "name",
            sortOrder: "asc",
          },
        }),
        "加载岗位面试官 Agent 失败",
      ),
    queryKey: ["interviewers", slug, "by-job-description", jobDescriptionId] as const,
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <div className="flex flex-wrap gap-2" data-slot="job-interviewer-agents-skeleton">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    );
  }
  if (isError) {
    return <p className="text-destructive text-sm">面试官 Agent 加载失败</p>;
  }
  if (data.records.length === 0) {
    return <p className="text-muted-foreground text-sm">该岗位未配置面试官 Agent</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {data.records.map((record) => (
        <li className="min-w-0" key={record.id}>
          <InterviewerAgentChip record={record} />
        </li>
      ))}
    </ul>
  );
}
