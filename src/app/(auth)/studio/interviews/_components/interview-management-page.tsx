// src/app/(auth)/studio/interviews/_components/interview-management-page.tsx
"use client";

import type { StudioInterviewListRecord } from "@/lib/studio-interviews";
import type {
  PaginatedStudioInterviewResult,
  StudioInterviewSummary,
} from "@/server/queries/studio-interviews";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { BotIcon, CopyIcon, EyeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  selectColumn,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { apiFetch, bulkDeleteStudioInterviews, deleteStudioInterview } from "@/lib/api";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/clipboard";
import {
  scheduleEntryStatusMeta,
  studioInterviewStatusMeta,
  studioInterviewStatusValues,
} from "@/lib/studio-interviews";
import { Badge } from "@/components/ui/badge";
import { CreateInterviewDialog } from "./create-interview-dialog";
import { EditInterviewDialog } from "./edit-interview-dialog";
import { InterviewDetailDialog } from "./interview-detail-dialog";
import { InterviewStatusBadge } from "./interview-status-badge";
import { JobDescriptionViewDialog } from "./job-description-view-dialog";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: { status: string };
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

function fetchInterviews(params: FetchParams): Promise<PaginatedStudioInterviewResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  if (params.filters.status && params.filters.status !== "all") {
    qs.set("status", params.filters.status);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.sortBy) {
    qs.set("sortBy", params.sortBy);
    qs.set("sortOrder", params.sortOrder ?? "asc");
  } else {
    qs.set("sortBy", "createdAt");
    qs.set("sortOrder", "desc");
  }
  return apiFetch<PaginatedStudioInterviewResult>(`/api/studio/interviews?${qs.toString()}`);
}

export function InterviewManagementPage({
  initialData,
  initialSummary,
}: {
  initialData: PaginatedStudioInterviewResult;
  initialSummary: StudioInterviewSummary;
}) {
  const queryClient = useQueryClient();

  const grid = useDataGridState<StudioInterviewListRecord, { status: string }>({
    defaultSorting: [{ desc: true, id: "createdAt" }],
    fetcher: fetchInterviews,
    initialData,
    initialFilters: { status: "all" },
    namespace: "studio-interviews",
  });

  // Summary query (independent of grid state)
  const summaryQuery = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () => apiFetch<StudioInterviewSummary>("/api/studio/interviews/summary"),
    queryKey: ["studio-interviews", "summary"] as const,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
  const summary = summaryQuery.data ?? initialSummary;

  // Dialog state
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StudioInterviewListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<StudioInterviewListRecord | null>(null);
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // 中文：从飞书通知卡片等外部链接进入时，URL 形如 ?recordId=xxx；
  // 自动打开详情 dialog 并清掉这个参数（避免刷新 / 分享时反复触发）。
  // English: when entering via an external link (e.g. Feishu notification card)
  // shaped like `?recordId=xxx`, auto-open the detail dialog and strip the
  // param so refreshes or shared URLs don't re-trigger.
  const searchParams = useSearchParams();
  const consumedRecordIdRef = useRef(false);
  useEffect(() => {
    if (consumedRecordIdRef.current) {
      return;
    }
    const recordIdFromUrl = searchParams.get("recordId");
    if (!recordIdFromUrl) {
      return;
    }
    consumedRecordIdRef.current = true;
    setDetailRecordId(recordIdFromUrl);
    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("recordId");
    const query = remaining.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [searchParams]);

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
  }

  async function copyInterviewLink(record: StudioInterviewListRecord) {
    const lastEntry = record.scheduleEntries.at(-1);
    const link = lastEntry ? `/interview/${record.id}/${lastEntry.id}` : record.interviewLink;
    const fullLink = toAbsoluteUrl(link);
    try {
      const result = await copyTextToClipboard(fullLink);
      if (result === "copied") {
        return toast.success("面试链接已复制");
      }
      if (result === "manual") {
        return toast.info("已弹出链接，请手动复制");
      }
      if (result === "failed") {
        throw new Error("copy-failed");
      }
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  const columns = useMemo(
    () => [
      selectColumn<StudioInterviewListRecord>(),
      customColumn<StudioInterviewListRecord>({
        cell: (r) => (
          <div className="min-w-0">
            <button
              className="block max-w-full cursor-pointer truncate text-left font-medium underline-offset-4 hover:underline"
              onClick={() => setDetailRecordId(r.id)}
              type="button"
            >
              {r.candidateName}
            </button>
            {r.candidateEmail ? (
              <a
                className="block max-w-full truncate text-muted-foreground text-xs underline-offset-4 hover:underline"
                href={`mailto:${r.candidateEmail}`}
                onClick={(e) => e.stopPropagation()}
              >
                {r.candidateEmail}
              </a>
            ) : (
              <p className="truncate text-muted-foreground text-xs">未填写邮箱</p>
            )}
          </div>
        ),
        key: "candidateName",
        size: 180,
        title: "候选人",
      }),
      textColumn<StudioInterviewListRecord>({
        cell: (r) => r.targetRole || "待识别岗位",
        key: "targetRole",
        title: "目标岗位",
      }),
      customColumn<StudioInterviewListRecord>({
        cell: (r) =>
          r.jobDescriptionName ? (
            <button
              className="cursor-pointer truncate text-left underline-offset-4 hover:underline"
              onClick={() => r.jobDescriptionId && setViewJobDescriptionId(r.jobDescriptionId)}
              type="button"
            >
              {r.jobDescriptionName}
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        key: "jobDescriptionName",
        title: "关联岗位",
      }),
      customColumn<StudioInterviewListRecord>({
        cell: (r) => {
          const label = r.resumeFileName || "手动创建";
          if (!r.hasResumeFile) {
            return (
              <div
                aria-disabled
                className="max-w-48 cursor-not-allowed truncate text-sm opacity-50"
                title="暂无简历 PDF"
              >
                {label}
              </div>
            );
          }
          return (
            <button
              className="block max-w-48 cursor-pointer truncate text-left text-sm underline-offset-4 hover:underline"
              onClick={() => setPreviewRecord(r)}
              type="button"
            >
              {label}
            </button>
          );
        },
        key: "resumeFileName",
        title: "简历文件",
      }),
      customColumn<StudioInterviewListRecord>({
        cell: (r) => <InterviewStatusBadge status={r.status} />,
        key: "status",
        title: "状态",
      }),
      customColumn<StudioInterviewListRecord>({
        cell: (r) => {
          const [currentEntry] = r.scheduleEntries;
          if (!currentEntry) {
            return "未安排";
          }
          const statusKey = (currentEntry.status ??
            "pending") as keyof typeof scheduleEntryStatusMeta;
          const statusMeta = scheduleEntryStatusMeta[statusKey] ?? scheduleEntryStatusMeta.pending;
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-medium text-sm">{currentEntry.roundLabel}</p>
                <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
              </div>
            </div>
          );
        },
        key: "currentRound",
        title: "当前轮次",
      }),
      customColumn<StudioInterviewListRecord>({
        cell: (r) => `${r.questionCount} 题`,
        key: "questionCount",
        title: "题目数",
      }),
      textColumn<StudioInterviewListRecord>({
        cell: (r) => r.creatorName ?? "—",
        key: "creatorName",
        title: "创建人",
      }),
      textColumn<StudioInterviewListRecord>({
        cell: (r) => r.creatorOrganizationName ?? "—",
        key: "creatorOrganizationName",
        title: "创建人组织",
      }),
      dateColumn<StudioInterviewListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      actionsColumn<StudioInterviewListRecord>({
        inline: [
          { icon: EyeIcon, label: "查看详情", onClick: (r) => setDetailRecordId(r.id) },
          { icon: PencilIcon, label: "编辑记录", onClick: (r) => setEditRecordId(r.id) },
        ],
        menu: [
          { icon: CopyIcon, label: "复制面试链接", onClick: (r) => void copyInterviewLink(r) },
          {
            icon: Trash2Icon,
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            variant: "destructive",
          },
        ],
      }),
    ],
    [],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、岗位、轮次或简历名",
        type: "search" as const,
      },
      {
        key: "status" as const,
        options: [
          { label: "全部状态", value: "all" },
          ...studioInterviewStatusValues.map((status) => ({
            label: studioInterviewStatusMeta[status].label,
            value: status,
          })),
        ],
        placeholder: "按状态筛选",
        type: "select" as const,
      },
    ],
    [],
  );

  const stats = (
    <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {[
        { hint: "所有候选人简历与流程记录", label: "总记录数", value: `${summary.total}` },
        { hint: "流程已准备好，可发送链接开始面试", label: "待面试", value: `${summary.ready}` },
        { hint: "全部轮次结束、已产出面试报告", label: "已完成", value: `${summary.completed}` },
        { hint: "所有候选人累计安排的轮次总数", label: "面试轮次数", value: `${summary.rounds}` },
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
  );

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    try {
      await deleteStudioInterview(deleteRecord.id);
      setDeleteRecord(null);
      toast.success("面试记录已删除");
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  }

  async function handleBulkDelete() {
    const ids = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]);
    if (ids.length === 0) {
      return;
    }
    setIsBulkDeleting(true);
    try {
      const result = await bulkDeleteStudioInterviews(ids);
      toast.success(`已删除 ${result?.deleted ?? ids.length} 条记录`);
      grid.setRowSelection({});
      setBulkDeleteOpen(false);
      invalidateAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="font-semibold text-lg">AI 面试</h2>
          <DataGrid<StudioInterviewListRecord>
            {...grid.bind}
            columns={columns}
            getRowId={(r) => r.id}
            columnPinning={{ left: ["select", "candidateName"], right: ["actions"] }}
            filters={filtersConfig}
            headerExtra={stats}
            toolbarRight={<CreateInterviewDialog onCreated={invalidateAll} />}
            bulkActions={({ selectedIds }) => (
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => setBulkDeleteOpen(true)}
                variant="destructive"
              >
                <Trash2Icon className="size-4" />
                批量删除 ({selectedIds.length})
              </Button>
            )}
            empty={
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
                  <CreateInterviewDialog onCreated={invalidateAll} />
                </EmptyContent>
              </Empty>
            }
          />
        </section>
      </div>

      <InterviewDetailDialog
        onOpenChange={(open) => !open && setDetailRecordId(null)}
        onUpdated={invalidateAll}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      <EditInterviewDialog
        onOpenChange={(open) => !open && setEditRecordId(null)}
        onUpdated={invalidateAll}
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
            <AlertDialogTitle>
              确认批量删除{" "}
              {Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]).length}{" "}
              条面试记录？
            </AlertDialogTitle>
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
              {isBulkDeleting
                ? "正在删除…"
                : `删除 ${Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]).length} 条记录`}
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
