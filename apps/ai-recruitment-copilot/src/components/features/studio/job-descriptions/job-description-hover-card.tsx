"use client";

import type { JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { cn } from "@arc/shared/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { MarkdownView } from "@/components/features/display/markdown-view";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

function JobDescriptionPreviewSkeleton() {
  return (
    <div className="space-y-4" data-slot="job-description-preview-skeleton">
      <div className="space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="h-4 w-28" />
    </div>
  );
}

function JobDescriptionPreview({ record }: { record: JobDescriptionRecord }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 wrap-break-word font-medium text-sm leading-5">{record.name}</h3>
          {record.code ? (
            <Badge className="shrink-0 font-mono" variant="secondary">
              {record.code}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          已配置 {record.interviewerIds.length} 位面试官
        </p>
      </div>

      <section className="flex flex-col gap-1">
        <h4 className="font-medium text-muted-foreground text-xs">岗位描述</h4>
        <ScrollArea className="max-h-32 [--scroll-fade-reveal:1rem]" scrollFade>
          <p className="pr-3 whitespace-pre-wrap wrap-break-word text-sm leading-5">
            {record.description?.trim() || "未填写"}
          </p>
        </ScrollArea>
      </section>

      <section className="flex flex-col gap-1">
        <h4 className="font-medium text-muted-foreground text-xs">岗位 Prompt</h4>
        <ScrollArea className="max-h-48" scrollFade>
          <MarkdownView className="pr-3 text-sm" content={record.prompt.trim() || "未填写"} />
        </ScrollArea>
      </section>
    </div>
  );
}

export function JobDescriptionHoverCard({
  className,
  jobDescriptionId,
  name,
}: {
  className?: string;
  jobDescriptionId: string | null | undefined;
  name: string | null | undefined;
}) {
  const slug = useOptionalWorkspaceSlug();
  const [open, setOpen] = useState(false);
  const displayName = name?.trim() || "暂未关联岗位";
  const canLoad = Boolean(jobDescriptionId && slug);
  const queryId = jobDescriptionId ?? "";
  const querySlug = slug ?? "";
  const {
    data: record,
    isError,
    isPending,
  } = useQuery({
    enabled: open && canLoad,
    queryFn: () =>
      rpcFetch<JobDescriptionRecord>(
        rpc.api.w[":slug"].studio["job-descriptions"][":id"].$get({
          param: { id: queryId, slug: querySlug },
        }),
        "加载岗位详情失败",
      ),
    queryKey: ["job-descriptions", slug, "detail", jobDescriptionId] as const,
    staleTime: 60_000,
  });

  if (!canLoad) {
    return <span className={className}>{displayName}</span>;
  }

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        render={
          <button
            className={cn(
              "cursor-pointer text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none",
              className,
            )}
            onClick={() => setOpen(true)}
            type="button"
          >
            {displayName}
          </button>
        }
      />
      <HoverCardContent align="start" className="w-96 max-w-[calc(100vw-2rem)]" sideOffset={8}>
        {isPending ? <JobDescriptionPreviewSkeleton /> : null}
        {isError ? (
          <p className="text-destructive text-sm">岗位详情加载失败，请稍后重试。</p>
        ) : null}
        {record ? <JobDescriptionPreview record={record} /> : null}
      </HoverCardContent>
    </HoverCard>
  );
}
