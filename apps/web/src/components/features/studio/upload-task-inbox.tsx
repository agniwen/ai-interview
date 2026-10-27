"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { IconAlertCircle, IconInbox, IconLoader2, IconRefresh } from "@tabler/icons-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { UploadTaskInboxPage, UploadTaskInboxRecord } from "@app/shared/upload-task-inbox";
import { formatRelativeTime } from "@app/shared/utils/time";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { ResumeDocumentPreviewDialog } from "@/components/features/resume/resume-document-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useHasPermission } from "@/hooks/use-has-permission";
import { getUploadTaskInboxPage } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  getUploadTaskPreviewTarget,
  getUploadTaskStatusMeta,
  resolveUploadTaskPreviewState,
} from "./upload-task-inbox-model";
import type { UploadTaskPreviewState } from "./upload-task-inbox-model";

import { StudioSidePaneContent, useStudioSidePane } from "./studio-side-pane-context";
import { StudioSidePaneSkeleton } from "./studio-side-pane-skeleton";
import { StudioSidePaneHeader } from "./studio-side-pane-header";

const UPLOAD_TASK_PANE_ID = "upload-tasks";

const TASK_ROW_ESTIMATE = 76;
interface UploadTaskPageParam {
  cursor: string | null;
}

const INITIAL_PAGE_PARAM: UploadTaskPageParam = { cursor: null };

const statusVariants = {
  cancelled: "outline",
  completed: "success",
  failed: "danger",
  pending: "warning",
  processing: "info",
} as const;

function UploadTaskRow({
  canPreview,
  onPreview,
  record,
}: {
  canPreview: boolean;
  onPreview: (record: UploadTaskInboxRecord) => void;
  record: UploadTaskInboxRecord;
}) {
  const status = getUploadTaskStatusMeta(record.queueState);
  const progress = record.progressPercent;
  const time = record.finishedAt ?? record.startedAt ?? record.queuedAt;
  const previewTarget = canPreview ? getUploadTaskPreviewTarget(record) : null;
  const fileKind = getResumeDocumentFileIconKind({
    fileName: record.originalFileName,
  });

  return (
    <button
      className="w-full border-border/60 border-b px-3 py-2.5 text-left transition-colors enabled:hover:bg-muted/40 disabled:cursor-default last:border-b-0"
      disabled={!previewTarget}
      onClick={() => onPreview(record)}
      title={previewTarget ? "点击预览简历" : undefined}
      type="button"
    >
      <div className="flex items-start gap-2.5">
        <ResumeDocumentFileIcon className="mt-0.5 size-6 shrink-0" kind={fileKind} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate font-medium text-sm"
              title={record.originalFileName}
            >
              {record.originalFileName}
            </p>
            <Badge className="shrink-0" variant={statusVariants[status.tone]}>
              {status.label}
            </Badge>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
            {record.candidateName ? (
              <>
                <span className="max-w-28 truncate">{record.candidateName}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span>{record.target === "resume_pool" ? "人才库" : "招聘台"}</span>
            {record.attemptCount > 1 ? (
              <>
                <span aria-hidden>·</span>
                <span>重试 {record.attemptCount - 1} 次</span>
              </>
            ) : null}
            <span className="ml-auto shrink-0">{formatRelativeTime(time)}</span>
          </div>
          {record.queueState === "active" ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Progress className="h-1" value={progress} />
              <span className="w-8 shrink-0 text-right text-[11px] text-muted-foreground">
                {progress === null ? "处理中" : `${Math.round(progress)}%`}
              </span>
            </div>
          ) : null}
          {record.queueState === "failed" && record.errorMessage ? (
            <p className="mt-1 line-clamp-1 text-red-ink text-xs">{record.errorMessage}</p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function UploadTaskInbox() {
  "use no memo";

  const slug = useWorkspaceSlug();
  const canReadUploadTasks = useHasPermission("resumeUploadBatch", "read");
  const canReadResumeLibrary = useHasPermission("resumeLibrary", "read");
  const canReadResumePool = useHasPermission("resumePool", "read");
  const [previewState, setPreviewState] = useState<UploadTaskPreviewState>(() => ({
    record: null,
    slug,
  }));
  const resolvedPreviewState = resolveUploadTaskPreviewState(previewState, slug);
  if (resolvedPreviewState !== previewState) {
    setPreviewState(resolvedPreviewState);
  }
  const previewRecord = resolvedPreviewState.record;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const query = useInfiniteQuery({
    enabled: canReadUploadTasks,
    getNextPageParam: (lastPage: UploadTaskInboxPage) =>
      lastPage.nextCursor ? { cursor: lastPage.nextCursor } : undefined,
    initialPageParam: INITIAL_PAGE_PARAM,
    queryFn: ({ pageParam }) => getUploadTaskInboxPage(slug, pageParam.cursor),
    queryKey: ["upload-task-inbox", slug],
    refetchInterval: 5000,
    staleTime: 3000,
  });
  const records = useMemo(
    () => query.data?.pages.flatMap((page) => page.records) ?? [],
    [query.data?.pages],
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const rowCount = records.length + (query.hasNextPage ? 1 : 0);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is compiler-incompatible and is intentionally skipped.
  const virtualizer = useVirtualizer({
    count: rowCount,
    estimateSize: () => TASK_ROW_ESTIMATE,
    getScrollElement: () => scrollRef.current,
    overscan: 5,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const previewTarget = previewRecord ? getUploadTaskPreviewTarget(previewRecord) : null;

  const handlePreview = (record: UploadTaskInboxRecord) => {
    const hasTargetPermission =
      record.target === "resume_pool" ? canReadResumePool : canReadResumeLibrary;
    if (!hasTargetPermission || !getUploadTaskPreviewTarget(record)) {
      return;
    }
    setPreviewState({ record, slug });
  };

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
    content = <StudioSidePaneSkeleton label="正在加载上传任务" />;
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
        <Button
          onClick={() => {
            query.refetch();
          }}
          size="sm"
          variant="outline"
        >
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
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                    <UploadTaskRow
                      canPreview={
                        record.target === "resume_pool" ? canReadResumePool : canReadResumeLibrary
                      }
                      onPreview={handlePreview}
                      record={record}
                    />
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
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <StudioSidePaneHeader
          title="上传任务"
          actions={
            <Button
              aria-label="刷新上传任务"
              disabled={query.isFetching}
              onClick={() => {
                query.refetch();
              }}
              size="icon-sm"
              variant="ghost"
            >
              <IconRefresh className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            </Button>
          }
        />
        {content}
      </div>
      {previewRecord && previewTarget ? (
        <ResumeDocumentPreviewDialog
          downloadUrl={`/api/w/${slug}/studio/${previewTarget.resource}/${previewTarget.id}/resume`}
          filename={previewRecord.originalFileName}
          kind={previewTarget.kind}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setPreviewState({ record: null, slug });
            }
          }}
          open
          url={`/api/w/${slug}/studio/${previewTarget.resource}/${previewTarget.id}/${previewTarget.path}`}
        />
      ) : null}
    </>
  );
}

export function UploadTaskInboxTrigger() {
  const pane = useStudioSidePane(UPLOAD_TASK_PANE_ID);
  const canReadUploadTasks = useHasPermission("resumeUploadBatch", "read");
  if (!canReadUploadTasks) {
    return null;
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              {...pane.triggerProps}
              aria-label={pane.isOpen ? "关闭上传任务" : "打开上传任务"}
              className={pane.isOpen ? "bg-accent" : undefined}
              size="icon-sm"
              variant="ghost"
            >
              <IconInbox className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="bottom">上传任务</TooltipContent>
      </Tooltip>
      <StudioSidePaneContent id={UPLOAD_TASK_PANE_ID}>
        <UploadTaskInbox />
      </StudioSidePaneContent>
    </>
  );
}
