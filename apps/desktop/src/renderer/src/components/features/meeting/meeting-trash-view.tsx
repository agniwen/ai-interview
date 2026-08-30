import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TrashedMeetingItem } from "@arc/shared/meeting-recording";
import { DEFAULT_PAGE_SIZE } from "@arc/shared/pagination";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { PaginationBar, PaginationBarSkeleton } from "@/components/data-grid/parts/pagination-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  desktopMeetingKeys,
  fetchTrashedMeetings,
  purgeMeeting,
  restoreMeeting,
} from "@/lib/client/meetings";
import { formatAppDateTime } from "@/lib/client/datetime";
import { meetingDisplayTitle } from "@arc/shared/utils/time";

function archiveListStatus(input: {
  error: boolean;
  pending: boolean;
  search: string;
  total: number;
}): "empty" | "error" | "loading" | "ready" | "unmatched" {
  if (input.pending) {
    return "loading";
  }
  if (input.error) {
    return "error";
  }
  if (input.total > 0) {
    return "ready";
  }
  return input.search ? "unmatched" : "empty";
}

function ArchivedMeetingEmptyState({ status }: { status: "empty" | "unmatched" }) {
  if (status === "unmatched") {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-sm">没有找到匹配的归档记录</p>
        <p className="mt-1 text-muted-foreground text-xs">试试其他标题关键词</p>
      </div>
    );
  }
  return (
    <div className="py-16 text-center">
      <p className="font-medium text-sm">还没有归档记录</p>
      <p className="mt-1 text-muted-foreground text-xs">归档的录制会在这里保留七天</p>
    </div>
  );
}

function ArchivedMeetingTable({
  busy,
  confirmPurgeId,
  meetings,
  onConfirmPurge,
  onOpenDetail,
  onRestore,
}: {
  busy: boolean;
  confirmPurgeId: string | null;
  meetings: TrashedMeetingItem[];
  onConfirmPurge: (meetingId: string) => void;
  onOpenDetail: (meetingId: string) => void;
  onRestore: (meetingId: string) => void;
}) {
  const openDetailOnKeyDown = (meetingId: string, event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetail(meetingId);
    }
  };
  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table aria-label="归档记录表格" className="min-w-[720px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[220px]">录制名称</TableHead>
            <TableHead className="w-[160px]">录制时间</TableHead>
            <TableHead className="w-[160px]">归档时间</TableHead>
            <TableHead className="w-[180px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((meeting) => (
            <TableRow
              aria-label={`查看归档记录 ${meetingDisplayTitle(meeting.title)}`}
              className="cursor-pointer"
              key={meeting.id}
              onClick={() => onOpenDetail(meeting.id)}
              onKeyDown={(event) => openDetailOnKeyDown(meeting.id, event)}
              tabIndex={0}
            >
              <TableCell>
                <span className="block truncate font-medium text-foreground">
                  {meetingDisplayTitle(meeting.title)}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatAppDateTime(meeting.savedAt)}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatAppDateTime(meeting.trashedAt)}
              </TableCell>
              <TableCell
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => onRestore(meeting.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    恢复
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => onConfirmPurge(meeting.id)}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {confirmPurgeId === meeting.id ? "确认永久清除" : "永久清除"}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ArchivedMeetingResultsSkeleton({ pageSize }: { pageSize: number }) {
  return (
    <div className="flex flex-col gap-3" data-slot="archived-meeting-results-skeleton">
      <div className="w-full overflow-hidden rounded-lg border">
        <Table className="min-w-[720px] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">
                <Skeleton className="h-4 w-20" />
              </TableHead>
              <TableHead className="w-[160px]">
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead className="w-[160px]">
                <Skeleton className="h-4 w-16" />
              </TableHead>
              <TableHead className="w-[180px]">
                <Skeleton className="h-4 w-10" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: pageSize }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-36" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-28" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-14" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PaginationBarSkeleton />
    </div>
  );
}

/**
 * 七天恢复窗口的归档记录表。二次点击只是防误触，永久删除的幂等与对象清扫由服务端 Tombstone 保证。
 * Archived-record table for the seven-day restore window; confirm click is UX only, while server tombstones own durable purge.
 */
export function MeetingTrashView({ slug }: { slug: string }) {
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchText(searchText), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchText, pageSize]);
  const query = {
    page,
    pageSize,
    search: debouncedSearchText.trim(),
    sortBy: "trashedAt" as const,
    sortOrder: "desc" as const,
  };
  const trashQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => fetchTrashedMeetings(slug, query),
    queryKey: desktopMeetingKeys.trash(slug, query),
    staleTime: 5000,
  });
  const paged = trashQuery.data;
  const isColdLoading = trashQuery.isPending && !paged;
  const records = paged?.records ?? [];
  const meetingsCount = paged?.total ?? 0;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.all(slug) }),
      queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.trash(slug) }),
    ]);
  const restoreMutation = useMutation({
    mutationFn: (meetingId: string) => restoreMeeting(slug, meetingId),
    onSuccess: invalidate,
  });
  const purgeMutation = useMutation({
    mutationFn: (meetingId: string) => purgeMeeting(slug, meetingId),
    onSuccess: async () => {
      setConfirmPurgeId(null);
      await invalidate();
    },
  });
  const busy = restoreMutation.isPending || purgeMutation.isPending;
  const status = archiveListStatus({
    error: Boolean(trashQuery.error),
    pending: trashQuery.isPending,
    search: query.search,
    total: meetingsCount,
  });
  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="搜索归档记录"
        className="max-w-64"
        onChange={(event) => setSearchText(event.currentTarget.value)}
        placeholder="搜索归档标题"
        type="search"
        value={searchText}
      />
      <SkeletonReveal
        loading={isColdLoading}
        skeleton={<ArchivedMeetingResultsSkeleton pageSize={pageSize} />}
      >
        {status === "error" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-destructive text-sm">
              {trashQuery.error instanceof Error ? trashQuery.error.message : "加载归档记录失败"}
            </p>
            <Button
              onClick={() => {
                trashQuery.refetch();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              重试
            </Button>
          </div>
        ) : null}
        {status === "empty" || status === "unmatched" ? (
          <ArchivedMeetingEmptyState status={status} />
        ) : null}
        {status === "ready" && paged ? (
          <div className="flex flex-col gap-3">
            <ArchivedMeetingTable
              busy={busy}
              confirmPurgeId={confirmPurgeId}
              meetings={records}
              onConfirmPurge={(meetingId) => {
                if (confirmPurgeId === meetingId) {
                  purgeMutation.mutate(meetingId);
                  return;
                }
                setConfirmPurgeId(meetingId);
              }}
              onOpenDetail={(meetingId) => {
                void navigate({
                  params: { meetingId },
                  to: "/meetings/$meetingId",
                });
              }}
              onRestore={(meetingId) => restoreMutation.mutate(meetingId)}
            />
            <PaginationBar
              loading={trashQuery.isFetching}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              page={paged.page}
              pageSize={paged.pageSize}
              total={paged.total}
              totalPages={paged.totalPages}
            />
          </div>
        ) : null}
      </SkeletonReveal>
      {restoreMutation.error || purgeMutation.error ? (
        <p className="text-destructive text-sm">
          {(restoreMutation.error ?? purgeMutation.error) instanceof Error
            ? (restoreMutation.error ?? purgeMutation.error)?.message
            : "更新归档记录失败"}
        </p>
      ) : null}
    </div>
  );
}
