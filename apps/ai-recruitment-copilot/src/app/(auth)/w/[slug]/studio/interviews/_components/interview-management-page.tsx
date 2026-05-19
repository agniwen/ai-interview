// src/app/(auth)/studio/interviews/_components/interview-management-page.tsx
"use client";

import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import type { InterviewRoundSummaryResponse } from "@/lib/client/api";
import {
  bulkDeleteStudioInterviewRounds,
  deleteStudioInterviewRound,
  fetchStudioInterviewSummary,
} from "@/lib/client/api";
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundListRecord,
} from "@/lib/shared/studio-interview-rounds";
import { scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
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
import { CreatorCell } from "@/components/cell/creator-cell";
import { Badge } from "@/components/ui/badge";
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
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import { StudioPersonDetailDialog } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-edit-dialog";
import type { RoundEmailSummary } from "@arc/db-schema/round-email-log";
import { JobDescriptionViewDialog } from "./job-description-view-dialog";
import { RoundEmailAction } from "./round-email/round-email-action";
import { useRoundEmailSummary } from "./round-email/use-round-email-summary";

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

export function InterviewManagementPage({
  initialData,
  initialSummary,
}: {
  initialData: PaginatedStudioInterviewRoundsResult;
  initialSummary: InterviewRoundSummaryResponse;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  // 拉取轮次列表（含分页 / 搜索 / 状态过滤）。
  // Fetch the round list with pagination / search / status filtering.
  const fetchRounds = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedStudioInterviewRoundsResult> => {
        const query: Record<string, string> = {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy ?? "createdAt",
          sortOrder: params.sortBy ? (params.sortOrder ?? "asc") : "desc",
        };
        if (params.search) {
          query.search = params.search;
        }
        // 多选过滤：CSV 形式传递给后端。/ Multi-select: CSV-serialised for the backend.
        if (params.filters.status) {
          query.status = params.filters.status;
        }
        return rpcFetch<PaginatedStudioInterviewRoundsResult>(
          rpc.api.w[":slug"].studio.interviews.$get({ param: { slug }, query }),
          "加载面试列表失败",
        );
      },
    [slug],
  );

  const grid = useDataGridState<StudioInterviewRoundListRecord, { status: string }>({
    // 默认按创建时间倒序。/ Default: createdAt descending.
    defaultSorting: [{ desc: true, id: "createdAt" }],
    fetcher: fetchRounds,
    initialData,
    initialFilters: { status: "" },
    namespace: "studio-interviews",
  });

  // 概览计数独立轮询（与列表分页状态无关）。
  // Summary query — independent of grid pagination state.
  const summaryQuery = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () => fetchStudioInterviewSummary(slug),
    queryKey: ["studio-interviews", slug, "summary"] as const,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
  const summary = summaryQuery.data ?? initialSummary;

  // Dialog state
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<StudioInterviewRoundListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<StudioInterviewRoundListRecord | null>(null);
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // 外部链接携带 ?recordId=xxx 时自动打开详情 dialog 并清掉参数。
  // When arriving via external link with ?recordId=xxx, open the detail dialog
  // and strip the param so it doesn't re-trigger on refresh.
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

  // 删除 / 重置 / 切轮次状态等写操作不仅影响 AI 面试列表，也会改变简历库的
  // hasInterviewRounds 标记和简历详情弹窗里的「AI 面试」tab，所以同步失效
  // studio-resumes / studio-resume-rounds，确保用户切回简历库立即看到更新。
  //
  // Writes on this page (delete / reset / round toggle) can flip
  // hasInterviewRounds on the resume-library row and the resume detail
  // dialog's AI-rounds tab — invalidate the resume-side keys too so the
  // library reflects the change without a manual refetch.
  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
  }

  // 复制面试链接：直接读 row.interviewLink，无需扫描 scheduleEntries。
  // Copy interview link: read row.interviewLink directly, no scheduleEntries scan needed.
  async function copyInterviewLink(record: StudioInterviewRoundListRecord) {
    const fullLink = toAbsoluteUrl(record.interviewLink);
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

  // 邮件发送汇总：按 roundId 索引，供列渲染使用。
  // Email send summaries indexed by roundId, consumed by the column renderer.
  const roundIds = grid.data.records.map((r) => r.id);
  const roundEmailSummaryQuery = useRoundEmailSummary(slug, roundIds);
  const summaryMap: Record<string, RoundEmailSummary> = useMemo(
    () => roundEmailSummaryQuery.data ?? {},
    [roundEmailSummaryQuery.data],
  );

  // 列定义：以 round 为主键，候选人信息作为快照列展示。
  // Column definitions: round-keyed; candidate info shown as snapshot columns.
  const columns = useMemo(
    () => [
      selectColumn<StudioInterviewRoundListRecord>(),
      customColumn<StudioInterviewRoundListRecord>({
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
      customColumn<StudioInterviewRoundListRecord>({
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
        title: "在招岗位",
      }),
      textColumn<StudioInterviewRoundListRecord>({
        cell: (r) => r.roundLabel,
        key: "roundLabel",
        title: "轮次",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        // null 排期显示占位文字，非 null 则复用标准时间格式。
        // Null scheduledAt shows a placeholder; non-null uses the standard time format.
        cell: (r) =>
          r.scheduledAt ? (
            <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={r.scheduledAt} />
          ) : (
            <span className="text-muted-foreground">未排期</span>
          ),
        key: "scheduledAt",
        title: "排期",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) => {
          const meta = scheduleEntryStatusMeta[r.status];
          return <Badge variant={meta.tone}>{meta.label}</Badge>;
        },
        key: "status",
        title: "状态",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) =>
          r.hasReport ? (
            <Badge variant="success">已生成</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        key: "hasReport",
        title: "报告",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) => <CreatorCell image={r.creatorImage} name={r.creatorName} />,
        key: "creatorName",
        title: "创建人",
      }),
      dateColumn<StudioInterviewRoundListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建于",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) => (
          <RoundEmailAction
            candidateEmail={r.candidateEmail}
            roundId={r.id}
            slug={slug}
            summary={summaryMap[r.id]}
          />
        ),
        key: "roundEmail",
        size: 220,
        title: "邮件",
      }),
      actionsColumn<StudioInterviewRoundListRecord>({
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
    [slug, summaryMap],
  );

  // 状态过滤选项：对应 round 级状态枚举。
  // Status filter options: map to the round-level status enum.
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
          { label: "待开始", value: "pending" },
          { label: "进行中", value: "in_progress" },
          { label: "已完成", value: "completed" },
          { label: "已中断", value: "interrupted" },
        ],
        placeholder: "全部状态",
        selectedFormat: (count: number) => `已选 ${count} 个状态`,
        type: "multi-select" as const,
      },
    ],
    [],
  );

  // 概览统计卡：来自 round 级聚合计数。
  // Summary stat cards: sourced from round-level aggregated counts.
  const stats = (
    <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      {[
        { hint: "该组织下所有面试轮次总数", label: "总轮数", value: `${summary.total}` },
        { hint: "尚未开始的轮次", label: "待开始", value: `${summary.pending}` },
        { hint: "正在进行或短暂中断的轮次", label: "进行中", value: `${summary.inProgress}` },
        { hint: "全部完成的轮次", label: "已完成", value: `${summary.completed}` },
        { hint: "已中断（会话断开）的轮次", label: "已中断", value: `${summary.interrupted}` },
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

  // 删除单条：目前以 roundId 调用旧 candidateId 端点，T5 修正前暂时会 404。
  // Delete single: calling old candidateId endpoint with roundId for now — will 404 until T5.
  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    try {
      await deleteStudioInterviewRound(slug, deleteRecord.id);
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
      const result = await bulkDeleteStudioInterviewRounds(slug, ids);
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
        <PageHeader
          title="AI 面试"
          description="管理候选人的 AI 语音面试，跟踪进度并查看评估报告。新建请到简历库发起。"
        />
        <DataGrid<StudioInterviewRoundListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(r) => r.id}
          columnPinning={{ left: ["select", "candidateName"], right: ["actions"] }}
          filters={filtersConfig}
          headerExtra={stats}
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
                <EmptyTitle>还没有候选人面试记录</EmptyTitle>
                <EmptyDescription>
                  请前往简历库新建简历记录，选择「保存并发起面试」即可创建面试。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link href={`/w/${slug}/studio/resumes`}>前往简历库</Link>
                </Button>
              </EmptyContent>
            </Empty>
          }
        />
      </div>

      {/* 详情 dialog：目前仍消费候选人详情，T4 切换到 round 视图。
          Detail dialog: still consumes candidate detail today — T4 pivots it to round view. */}
      <StudioPersonDetailDialog
        mode="interview"
        onOpenChange={(open) => !open && setDetailRecordId(null)}
        onUpdated={invalidateAll}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      {/* 编辑 dialog：T5 修正写入路径。/ Edit dialog: T5 fixes the write path. */}
      <StudioPersonEditDialog
        mode="interview"
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
          url={`/api/w/${slug}/studio/interviews/${previewRecord.candidateId}/resume`}
        />
      ) : null}

      <JobDescriptionViewDialog
        jobDescriptionId={viewJobDescriptionId}
        onOpenChange={(open) => !open && setViewJobDescriptionId(null)}
      />
    </>
  );
}
