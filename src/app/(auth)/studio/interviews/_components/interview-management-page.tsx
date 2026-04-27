"use client";

import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import type { StudioInterviewListRecord } from "@/lib/studio-interviews";
import type {
  PaginatedStudioInterviewResult,
  StudioInterviewSummary,
} from "@/server/queries/studio-interviews";
import { useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { bulkDeleteStudioInterviews, deleteStudioInterview } from "@/lib/api";
import { useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import {
  BotIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  STUDIO_TUTORIAL_MOCK_RECORDS,
  STUDIO_TUTORIAL_MOCK_SEARCH,
} from "@/app/(auth)/studio/_hooks/studio-tutorial-mock";
import { studioTutorialStepAtom } from "@/app/(auth)/studio/_hooks/use-studio-tutorial";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/clipboard";
import { studioInterviewStatusMeta, studioInterviewStatusValues } from "@/lib/studio-interviews";
import { CreateInterviewDialog } from "./create-interview-dialog";
import { EditInterviewDialog } from "./edit-interview-dialog";
import { InterviewDetailDialog } from "./interview-detail-dialog";
import { buildInterviewListColumns } from "./interview-list/columns";
import { getPinningStyles } from "./interview-list/get-pinning-styles";
import { useInterviewListData } from "./interview-list/use-interview-list-data";
import { JobDescriptionViewDialog } from "./job-description-view-dialog";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

// oxlint-disable-next-line complexity -- Page component hosts list filters, dialog state, and mutation handlers; splitting fragments domain logic.
export function InterviewManagementPage({
  initialData,
  initialSummary,
}: {
  initialData: PaginatedStudioInterviewResult;
  initialSummary: StudioInterviewSummary;
}) {
  const tutorialStep = useAtomValue(studioTutorialStepAtom);
  const queryClient = useQueryClient();

  // Filter / pagination / sorting state — drives the query key
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | (typeof studioInterviewStatusValues)[number]
  >("all");
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [sorting, setSorting] = useState<SortingState>([{ desc: true, id: "createdAt" }]);

  // Dialogs
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StudioInterviewListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<StudioInterviewListRecord | null>(null);
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const deferredSearch = useDeferredValue(globalFilter);
  const currentSortBy = sorting[0]?.id ?? "createdAt";
  const currentSortOrder = sorting[0]?.desc ? "desc" : "asc";

  // 数据 / 概览查询 — 由独立 hook 管理；这里只负责把 SSR 初始数据注入缓存。
  // List + summary queries are owned by a dedicated hook; this scope only seeds SSR data.
  const {
    data,
    isFetching,
    isRefetching,
    queryKey,
    summary: summaryData,
    summaryQueryKey,
  } = useInterviewListData(
    {
      page,
      pageSize,
      search: deferredSearch.trim(),
      sortBy: currentSortBy,
      sortOrder: currentSortOrder,
      status: statusFilter,
    },
    { data: initialData, summary: initialSummary },
  );

  // Seed cache with SSR data only once on mount
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    queryClient.setQueryData(queryKey, initialData);
    queryClient.setQueryData(summaryQueryKey, initialSummary);
  }

  const { records } = data;
  const { total } = data;
  const { totalPages } = data;

  const isTutorialActive = tutorialStep !== null;
  const displayRecords =
    isTutorialActive && records.length === 0 ? STUDIO_TUTORIAL_MOCK_RECORDS : records;
  const displaySearch =
    isTutorialActive && tutorialStep >= 3 && globalFilter === ""
      ? STUDIO_TUTORIAL_MOCK_SEARCH
      : globalFilter;
  const isFilterLoading = isFetching && !isRefetching;
  const isMutationRefreshing = isRefetching;

  function invalidateList() {
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
  }

  // Reset to page 1 when search/status changes
  const prevSearchRef = useMemo(
    () => ({ search: deferredSearch.trim(), status: statusFilter }),
    [deferredSearch, statusFilter],
  );
  const [lastFilterKey, setLastFilterKey] = useState(prevSearchRef);
  if (prevSearchRef !== lastFilterKey) {
    setLastFilterKey(prevSearchRef);
    if (page !== 1) {
      setPage(1);
    }
  }

  function goToPage(targetPage: number) {
    setPage(targetPage);
  }

  function handlePageSizeChange(newSize: string) {
    setPageSize(Number(newSize));
    setPage(1);
  }

  function handleSortingChange(updater: SortingState | ((prev: SortingState) => SortingState)) {
    const newSorting = typeof updater === "function" ? updater(sorting) : updater;
    setSorting(newSorting);
    setPage(1);
  }

  async function copyInterviewLink(record: StudioInterviewListRecord) {
    const lastEntry = record.scheduleEntries.at(-1);
    const link = lastEntry ? `/interview/${record.id}/${lastEntry.id}` : record.interviewLink;
    const fullLink = toAbsoluteUrl(link);

    try {
      const result = await copyTextToClipboard(fullLink);

      if (result === "copied") {
        toast.success("面试链接已复制");
        return;
      }

      if (result === "manual") {
        toast.info("已弹出链接，请手动复制");
        return;
      }

      if (result === "failed") {
        throw new Error("copy-failed");
      }
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  // 列定义抽到 ./interview-list/columns.tsx，便于独立 review。
  // Column definitions live in ./interview-list/columns.tsx for separate review.
  const columns = useMemo(
    () =>
      buildInterviewListColumns({
        onCopyLink: copyInterviewLink,
        onDelete: setDeleteRecord,
        onEdit: setEditRecordId,
        onPreviewResume: setPreviewRecord,
        onViewDetail: setDetailRecordId,
        onViewJobDescription: setViewJobDescriptionId,
      }),
    [],
  );

  const table = useReactTable({
    columns,
    data: displayRecords,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualSorting: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: handleSortingChange,
    state: {
      columnPinning: {
        left: ["select", "candidateName"],
        right: ["actions"],
      },
      rowSelection,
      sorting,
    },
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const selectedCount = selectedIds.length;

  const summary = summaryData;

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    try {
      await deleteStudioInterview(deleteRecord.id);
      setDeleteRecord(null);
      toast.success("面试记录已删除");
      invalidateList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleBulkDelete() {
    if (selectedCount === 0) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const result = await bulkDeleteStudioInterviews(selectedIds);
      toast.success(`已删除 ${result?.deleted ?? selectedCount} 条记录`);
      setRowSelection({});
      setBulkDeleteOpen(false);
      invalidateList();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  // Pagination info
  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  return (
    <>
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-tour="studio-stats">
          {[
            { hint: "所有候选人简历与流程记录", label: "总记录数", value: `${summary.total}` },
            {
              hint: "流程已准备好，可发送链接开始面试",
              label: "待面试",
              value: `${summary.ready}`,
            },
            {
              hint: "全部轮次结束、已产出面试报告",
              label: "已完成",
              value: `${summary.completed}`,
            },
            {
              hint: "所有候选人累计安排的轮次总数",
              label: "面试轮次数",
              value: `${summary.rounds}`,
            },
          ].map((item) => (
            <Card key={item.label}>
              <CardHeader className="pb-2">
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-3xl">{item.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{item.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="font-semibold text-lg">简历库记录</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative sm:min-w-60" data-tour="studio-search">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pr-9 pl-9"
                  onChange={(event) => setGlobalFilter(event.target.value)}
                  placeholder="搜索候选人、岗位、轮次或简历名"
                  value={displaySearch}
                />
                {isFilterLoading ? (
                  <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              <Select
                onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
                value={statusFilter}
              >
                <SelectTrigger
                  className="w-full sm:min-w-45 sm:w-auto"
                  data-tour="studio-status-filter"
                >
                  <SelectValue placeholder="按状态筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {studioInterviewStatusValues.map((status) => (
                    <SelectItem key={status} value={status}>
                      {studioInterviewStatusMeta[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="shrink-0"
                disabled={isFetching}
                onClick={() => invalidateList()}
                size="icon"
                variant="outline"
              >
                <RefreshCwIcon className={`size-4 ${isMutationRefreshing ? "animate-spin" : ""}`} />
                <span className="sr-only">刷新</span>
              </Button>
              <div className="flex-1 sm:flex-none" data-tour="studio-create-btn">
                <CreateInterviewDialog
                  onCreated={() => {
                    invalidateList();
                  }}
                />
              </div>
              {selectedCount > 0 ? (
                <Button
                  className="flex-1 sm:flex-none"
                  onClick={() => setBulkDeleteOpen(true)}
                  variant="destructive"
                >
                  <Trash2Icon className="size-4" />
                  批量删除 ({selectedCount})
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-4">
            {table.getRowModel().rows.length > 0 ? (
              <Card className="overflow-hidden py-0" data-tour="studio-table">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          const isPinned = header.column.getIsPinned();

                          return (
                            <TableHead
                              className={
                                isPinned
                                  ? "bg-background px-3! transition-colors [tr:hover_&]:bg-muted [tr[data-state=selected]_&]:bg-muted"
                                  : undefined
                              }
                              key={header.id}
                              style={getPinningStyles(header.column)}
                            >
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => {
                          const isPinned = cell.column.getIsPinned();

                          return (
                            <TableCell
                              className={
                                isPinned
                                  ? "bg-background px-3! transition-colors [tr:hover_&]:bg-muted [tr[data-state=selected]_&]:bg-muted"
                                  : undefined
                              }
                              key={cell.id}
                              style={getPinningStyles(cell.column)}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ) : (
              <Empty className="border-border/60">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BotIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>还没有候选人简历记录</EmptyTitle>
                  <EmptyDescription>
                    先创建一条候选人简历记录，可以直接手动录入，也可以上传 PDF
                    自动分析并生成面试题。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <CreateInterviewDialog
                    onCreated={() => {
                      invalidateList();
                    }}
                  />
                </EmptyContent>
              </Empty>
            )}

            {/* Pagination bar */}
            {total > 0 && (
              <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
                <p className="text-muted-foreground text-sm tabular-nums">
                  显示第 {startRow}–{endRow} 条，共 {total} 条记录
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">每页</span>
                    <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="h-8 w-[5.5rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size} 条
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <span className="text-muted-foreground text-sm tabular-nums">
                    第 {page} / {totalPages} 页
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => goToPage(1)}
                      disabled={page <= 1 || isFetching}
                      aria-label="第一页"
                    >
                      <ChevronsLeftIcon className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1 || isFetching}
                      aria-label="上一页"
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages || isFetching}
                      aria-label="下一页"
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => goToPage(totalPages)}
                      disabled={page >= totalPages || isFetching}
                      aria-label="最后一页"
                    >
                      <ChevronsRightIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <InterviewDetailDialog
        onOpenChange={(open) => !open && setDetailRecordId(null)}
        onUpdated={() => {
          invalidateList();
        }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      <EditInterviewDialog
        onOpenChange={(open) => !open && setEditRecordId(null)}
        onUpdated={() => {
          invalidateList();
        }}
        open={editRecordId !== null}
        recordId={editRecordId}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条面试记录？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将无法恢复，所有关联的面试轮次、对话记录与面试报告都会一并级联删除。当前记录：
              {deleteRecord?.candidateName ?? "未知候选人"}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              删除记录
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setBulkDeleteOpen} open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除 {selectedCount} 条面试记录？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。所选记录及其附属数据（面试轮次安排、候选人对话记录、AI
              生成的面试题与面试报告）都将被级联删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleBulkDelete();
              }}
              variant="destructive"
            >
              {isBulkDeleting ? "正在删除…" : `删除 ${selectedCount} 条记录`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewRecord ? (
        <PdfPreviewDialog
          filename={previewRecord.resumeFileName ?? undefined}
          onOpenChange={(open) => !open && setPreviewRecord(null)}
          open={previewRecord !== null}
          url={`/api/studio/interviews/${previewRecord.id}/resume`}
        />
      ) : null}

      <JobDescriptionViewDialog
        jobDescriptionId={viewJobDescriptionId}
        onOpenChange={(open) => !open && setViewJobDescriptionId(null)}
      />
    </>
  );
}
