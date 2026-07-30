"use client";

import {
  IconAlertCircle,
  IconFileText,
  IconInbox,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { UploadTaskInboxPage, UploadTaskInboxRecord } from "@arc/shared/upload-task-inbox";
import { formatRelativeTime } from "@arc/shared/utils/time";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useHasPermission } from "@/hooks/use-has-permission";
import { getUploadTaskInboxPage } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { getUploadTaskStatusMeta } from "./upload-task-inbox-model";

const TASK_ROW_ESTIMATE = 116;
const INITIAL_PAGE_PARAM: { cursor: string | null } = { cursor: null };

const statusClasses = {
  cancelled: "border-border bg-muted/50 text-muted-foreground",
  completed: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  pending: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  processing: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
} as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadTaskRow({ record }: { record: UploadTaskInboxRecord }) {
  const status = getUploadTaskStatusMeta(record.queueState);
  const progress = record.progressPercent;
  const displayName = record.candidateName?.trim() || record.originalFileName;
  const time = record.finishedAt ?? record.startedAt ?? record.queuedAt;

  return (
    <article className="border-border/60 border-b px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <IconFileText className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-sm" title={displayName}>
                {displayName}
              </p>
              <p className="mt-0.5 truncate text-muted-foreground text-xs">
                {record.originalFileName}
              </p>
            </div>
            <Badge className={statusClasses[status.tone]} variant="outline">
              {status.label}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
            <span>{record.target === "resume_pool" ? "人才库" : "招聘台"}</span>
            {record.targetRole ? (
              <>
                <span aria-hidden>·</span>
                <span className="max-w-28 truncate">{record.targetRole}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>{formatFileSize(record.fileSize)}</span>
            {record.attemptCount > 1 ? (
              <>
                <span aria-hidden>·</span>
                <span>第 {record.attemptCount} 次尝试</span>
              </>
            ) : null}
            <span className="ml-auto shrink-0">{formatRelativeTime(time)}</span>
          </div>
          {record.queueState === "active" ? (
            <div className="mt-2 flex items-center gap-2">
              <Progress className="h-1.5" value={progress} />
              <span className="w-8 shrink-0 text-right text-muted-foreground text-xs">
                {progress === null ? "处理中" : `${Math.round(progress)}%`}
              </span>
            </div>
          ) : null}
          {record.queueState === "failed" && record.errorMessage ? (
            <p className="mt-2 line-clamp-2 text-rose-600 text-xs dark:text-rose-300">
              {record.errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function UploadTaskInbox() {
  const slug = useWorkspaceSlug();
  const canReadUploadTasks = useHasPermission("resumeUploadBatch", "read");
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const query = useInfiniteQuery({
    enabled: open && canReadUploadTasks,
    getNextPageParam: (lastPage: UploadTaskInboxPage) =>
      lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
    initialPageParam: INITIAL_PAGE_PARAM,
    queryFn: ({ pageParam }) => getUploadTaskInboxPage(slug, pageParam.cursor),
    queryKey: ["upload-task-inbox", slug],
    refetchInterval: open ? 5000 : false,
    staleTime: 3000,
  });
  const records = useMemo(
    () => query.data?.pages.flatMap((page) => page.records) ?? [],
    [query.data?.pages],
  );
  const total = query.data?.pages[0]?.total ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const rowCount = records.length + (query.hasNextPage ? 1 : 0);
  const virtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => TASK_ROW_ESTIMATE,
    getScrollElement: () => scrollRef.current,
    overscan: 5,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const lastRow = virtualRows.at(-1);
    if (lastRow && lastRow.index >= records.length - 3 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, records.length, virtualRows]);

  if (!canReadUploadTasks) {
    return null;
  }

  let content;
  if (query.isPending) {
    content = (
      <div className="flex h-56 items-center justify-center gap-2 text-muted-foreground text-sm">
        <IconLoader2 className="size-4 animate-spin" />
        正在加载任务
      </div>
    );
  } else if (query.isError) {
    content = (
      <div className="flex h-56 flex-col items-center justify-center gap-3 px-8 text-center">
        <IconAlertCircle className="size-8 text-destructive" />
        <div>
          <p className="font-medium text-sm">任务加载失败</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {query.error instanceof Error ? query.error.message : "请稍后重试"}
          </p>
        </div>
        <Button onClick={() => void query.refetch()} size="sm" variant="outline">
          重新加载
        </Button>
      </div>
    );
  } else if (records.length === 0) {
    content = (
      <div className="flex h-56 flex-col items-center justify-center text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-muted">
          <IconInbox className="size-5 text-muted-foreground" />
        </div>
        <p className="mt-3 font-medium text-sm">还没有上传任务</p>
        <p className="mt-1 text-muted-foreground text-xs">上传简历后，解析进度会显示在这里</p>
      </div>
    );
  } else {
    content = (
      <>
        <div ref={scrollRef} className="h-[min(60vh,32rem)] overflow-y-auto">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualRows.map((virtualRow) => {
              const record = records[virtualRow.index];
              return (
                <div
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full"
                  data-index={virtualRow.index}
                  key={record?.id ?? "load-more"}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {record ? (
                    <UploadTaskRow record={record} />
                  ) : (
                    <div className="flex h-16 items-center justify-center gap-2 text-muted-foreground text-xs">
                      <IconLoader2 className="size-4 animate-spin" />
                      正在加载更多
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="border-border/60 border-t px-4 py-2 text-muted-foreground text-xs">
          已显示 {records.length} / {total} 条任务
        </div>
      </>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label="打开上传任务 Inbox"
            className="relative"
            size="icon-sm"
            variant="ghost"
          >
            <IconInbox className="size-4" />
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-[min(26rem,calc(100vw-1rem))] overflow-hidden p-0"
        sideOffset={8}
      >
        <PopoverHeader className="border-border/60 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <PopoverTitle>上传任务</PopoverTitle>
              <PopoverDescription>当前工作区中由你提交的简历解析任务</PopoverDescription>
            </div>
            <Button
              aria-label="刷新上传任务"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              size="icon-sm"
              variant="ghost"
            >
              <IconRefresh className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        </PopoverHeader>
        {content}
      </PopoverContent>
    </Popover>
  );
}
