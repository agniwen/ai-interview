import { listTextQuery } from "@arc/shared/list-text-filters";
import { IconRobot, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { PageHeader } from "@/components/features/studio/page-header";
import { StudioSummaryCards } from "@/components/features/studio/studio-summary-cards";
import {
  bulkDeleteStudioInterviewRounds,
  deleteStudioInterviewRound,
  fetchStudioInterviewSummary,
  rpcFetch,
} from "@/lib/client/api";
import type {
  PaginatedStudioInterviewRoundsResult,
  StudioInterviewRoundListRecord,
} from "@arc/shared/studio-interview-rounds";
import { pipelineStageMeta, scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
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
import { CreatorCell } from "@/components/data-grid/cells/creator-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  selectColumn,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import {
  getPreviewableResumeDocumentKind,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import { rpc } from "@/lib/client/rpc";
import { runAsyncAction } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  copyInterviewLink,
  copyPublicInterviewLink,
} from "@/components/features/studio/interviews/interview-link-actions";
import { resolveAiInterviewLinkState } from "@/components/features/studio/interviews/ai-interview-link-state";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/components/features/studio/studio-person-edit-dialog";
import { JobDescriptionViewDialog } from "@/components/features/studio/interviews/job-description-view-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";
import { firstSearchValue } from "@/lib/client/data-grid-search";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";
import { CandidateEvaluationDocumentCell } from "@/components/features/studio/interviews/candidate-evaluation-document-cell";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: { creatorIds: string; status: string };
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

// AI 阶段锁：候选人推进到真人复面/Offer/已结束后，AI 面试相关写动作禁用。
// AI-stage lock: once the candidate moves past ai_interview, AI round write actions are disabled.
function isAiStageLocked(row: StudioInterviewRoundListRecord): boolean {
  return row.pipelineStage !== "screening" && row.pipelineStage !== "ai_interview";
}

function aiStageLockedReason(row: StudioInterviewRoundListRecord): string | null {
  if (!isAiStageLocked(row)) {
    return null;
  }
  return `候选人已进入「${pipelineStageMeta[row.pipelineStage].label}」阶段，AI 面试相关操作已锁定。如需修改请先回退阶段或重新激活。`;
}

export function InterviewManagementPage() {
  const slug = useWorkspaceSlug();
  const navigate = useNavigate();
  const routeSearch = useSearch({ from: "/w/$slug/studio/interviews" });
  const queryClient = useQueryClient();
  const canUpdateInterview = useHasPermission("interview", "update");
  const canDeleteInterview = useHasPermission("interview", "delete");
  const canReadJobDescriptions = useHasPermission("jd", "read");

  // 拉取轮次列表（含分页 / 搜索 / 状态过滤）。
  // Fetch the round list with pagination / search / status filtering.
  const fetchRounds = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedStudioInterviewRoundsResult> => {
        const query: SearchParamsRecord = {
          ...listTextQuery(params),
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
        if (params.filters.creatorIds) {
          query.creatorIds = params.filters.creatorIds;
        }
        return rpcFetch(
          rpc.api.w[":slug"].studio.interviews.$get({ param: { slug }, query }),
          "加载面试列表失败",
        );
      },
    [slug],
  );

  const grid = useDataGridState<
    StudioInterviewRoundListRecord,
    { creatorIds: string; status: string }
  >({
    allowedSortIds: ["scheduledAt", "createdAt", "candidateName", "roundLabel"],
    // 默认按创建时间倒序。/ Default: createdAt descending.
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", status: "" },
    queryFn: fetchRounds,
    queryKeyBase: ["studio-interviews", slug],
  });

  const { data: workspaceMembersResult } = useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载成员列表失败",
      ),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });
  const workspaceMembers = useMemo(
    () => workspaceMembersResult?.records ?? [],
    [workspaceMembersResult],
  );

  // 概览计数独立轮询（与列表分页状态无关）。
  // Summary query — independent of grid pagination state.
  const summaryQuery = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () => fetchStudioInterviewSummary(slug),
    queryKey: ["studio-interviews", slug, "summary"] as const,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
  const summary = summaryQuery.data ?? {
    completed: 0,
    inProgress: 0,
    interrupted: 0,
    pending: 0,
    total: 0,
  };

  // Dialog state
  // 详情弹窗支持两种入口:列表行点击直接给 roundId,外部链接 (?recordId=) 给候选人级 id,
  // 互斥。Panel 内部会自动 resolve 出最终的 roundId。
  // Detail dialog has two entry kinds: list rows pass roundId directly; legacy
  // ?recordId= URLs pass a candidate-level id. They are mutually exclusive —
  // the Panel resolves either to the same internal roundId.
  const [detailRoundId, setDetailRoundId] = useState<string | null>(null);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [resumeEditRecordId, setResumeEditRecordId] = useState<string | null>(null);
  const detailOpen = detailRoundId !== null || detailRecordId !== null;
  function closeDetail() {
    setDetailRoundId(null);
    setDetailRecordId(null);
  }
  const [deleteRecord, setDeleteRecord] = useState<StudioInterviewRoundListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<StudioInterviewRoundListRecord | null>(null);
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // 外部链接两种形态:
  //  - ?roundId=<roundId>   新飞书卡片走这条
  //  - ?recordId=<recordId> 历史飞书卡片 / 手动复制旧链接走这条
  // 二选一,优先 roundId。读到后写入对应 state、清掉 URL 参数,Panel 内部
  // 自己 resolve;不需要这里再额外 fetch。
  //
  // External-link entry has two query forms — ?roundId= (current Feishu
  // cards) and ?recordId= (legacy cards / pasted older URLs). Prefer
  // roundId, route into the matching state slot, and let the Panel's
  // internal resolver handle whichever id we got.
  const consumedRecordIdRef = useRef(false);
  useEffect(() => {
    if (consumedRecordIdRef.current) {
      return;
    }
    const roundIdFromUrl = firstSearchValue(routeSearch.roundId);
    const recordIdFromUrl = firstSearchValue(routeSearch.recordId);
    if (!(roundIdFromUrl || recordIdFromUrl)) {
      return;
    }
    consumedRecordIdRef.current = true;

    const nextSearch: SearchParamsRecord = { ...routeSearch };
    delete nextSearch.roundId;
    delete nextSearch.recordId;
    navigate({
      params: { slug },
      replace: true,
      search: nextSearch,
      to: "/w/$slug/studio/interviews",
    });

    if (roundIdFromUrl) {
      // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
      setDetailRoundId(roundIdFromUrl);
    } else if (recordIdFromUrl) {
      setDetailRecordId(recordIdFromUrl);
    }
  }, [navigate, routeSearch, slug]);

  // 删除 / 重置 / 切轮次状态等写操作不仅影响 AI 面试列表，也会改变招聘台的
  // hasInterviewRounds 标记和简历详情弹窗里的「AI 面试」tab，所以同步失效
  // studio-resumes / studio-resume-rounds，确保用户切回招聘台立即看到更新。
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

  const generateEvaluationDocument = useMutation({
    mutationFn: (roundId: string) =>
      rpcFetch(
        rpc.api.w[":slug"].studio.interviews[":id"]["evaluation-document"].$post({
          param: { id: roundId, slug },
        }),
        "生成候选人评价表失败",
      ),
    mutationKey: ["studio-interviews", slug, "generate-evaluation-document"],
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "生成候选人评价表失败");
    },
    onSuccess: () => {
      toast.success("候选人评价表已生成");
      invalidateAll();
    },
  });

  // 列定义：以 round 为主键，候选人信息作为快照列展示。
  // Column definitions: round-keyed; candidate info shown as snapshot columns.
  const columns = useMemo(
    () => [
      ...(canDeleteInterview ? [selectColumn<StudioInterviewRoundListRecord>()] : []),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) => {
          const documentKind = getResumeDocumentFileIconKind({ fileName: r.resumeFileName });
          const previewable = isPreviewableResumeDocumentInput({ fileName: r.resumeFileName });
          const previewTitle = r.resumeFileName ?? "查看简历";
          return (
            <div className="flex min-w-0 items-center gap-2">
              {r.hasResumeFile && previewable ? (
                <button
                  aria-label={previewTitle}
                  className="group/pdf inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewRecord(r);
                  }}
                  title={previewTitle}
                  type="button"
                >
                  <ResumeDocumentFileIcon
                    className="size-8 transition-transform duration-200 group-hover/pdf:scale-105"
                    kind={documentKind}
                  />
                </button>
              ) : (
                <span
                  aria-disabled="true"
                  aria-label="暂无可预览简历"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
                  title="暂无可预览简历"
                >
                  <ResumeDocumentFileIcon className="size-8" kind={documentKind} />
                </span>
              )}
              <div className="min-w-0">
                <button
                  className="block max-w-full truncate text-left font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
                  onClick={() => setDetailRoundId(r.id)}
                  type="button"
                >
                  {r.candidateName}
                </button>
                {r.candidateEmail ? (
                  <a
                    className="block max-w-full cursor-default truncate text-muted-foreground text-xs underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
                    href={`mailto:${r.candidateEmail}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.candidateEmail}
                  </a>
                ) : (
                  <p className="truncate text-muted-foreground text-xs">未填写邮箱</p>
                )}
              </div>
            </div>
          );
        },
        key: "candidateName",
        size: 240,
        title: "候选人",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) => {
          const label = r.jobDescriptionName
            ? [r.jobDescriptionDepartmentName, r.jobDescriptionName].filter(Boolean).join(" / ")
            : null;

          if (!label) {
            return <span className="text-muted-foreground">—</span>;
          }
          if (!canReadJobDescriptions) {
            return <span className="truncate text-left">{label}</span>;
          }
          return (
            <button
              className="truncate text-left underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
              onClick={() => r.jobDescriptionId && setViewJobDescriptionId(r.jobDescriptionId)}
              type="button"
            >
              {label}
            </button>
          );
        },
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
        cell: (r) => (
          <CandidateEvaluationDocumentCell
            canGenerate={canUpdateInterview}
            generating={
              generateEvaluationDocument.isPending && generateEvaluationDocument.variables === r.id
            }
            onGenerate={(roundId) => generateEvaluationDocument.mutate(roundId)}
            row={r}
          />
        ),
        key: "feishuDocumentUrl",
        title: "候选人评价表",
      }),
      customColumn<StudioInterviewRoundListRecord>({
        cell: (r) => <CreatorCell image={r.creatorImage} name={r.creatorName} />,
        key: "creatorName",
        title: "创建人",
      }),
      dateColumn<StudioInterviewRoundListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      dateColumn<StudioInterviewRoundListRecord>({
        emptyText: "—",
        key: "lastInterviewAt",
        title: "最近面试时间",
      }),
      actionsColumn<StudioInterviewRoundListRecord>({
        inline: [
          { label: "查看", onClick: (r) => setDetailRoundId(r.id) },
          {
            disabled: isAiStageLocked,
            disabledReason: aiStageLockedReason,
            label: "编辑",
            onClick: (r) => setEditRecordId(r.id),
            show: () => canUpdateInterview,
          },
        ],
        menu: [
          {
            disabled: (row) =>
              isAiStageLocked(row) || resolveAiInterviewLinkState(row).copyDisabled,
            disabledReason: (row) => {
              const linkState = resolveAiInterviewLinkState(row);
              return linkState.copyDisabled ? linkState.message : aiStageLockedReason(row);
            },
            label: "复制面试链接",
            onClick: copyInterviewLink,
          },
          {
            label: "复制公共访问链接",
            onClick: copyPublicInterviewLink,
          },
          {
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            show: () => canDeleteInterview,
            variant: "destructive",
          },
        ],
      }),
    ],
    [canDeleteInterview, canReadJobDescriptions, canUpdateInterview, generateEvaluationDocument],
  );

  // 状态过滤选项：对应 round 级状态枚举。
  // Status filter options: map to the round-level status enum.
  const filtersConfig = useMemo(
    () => [
      {
        key: "textFilters" as const,
        resource: "interviews" as const,
        type: "text-filters" as const,
      },
      {
        emptyMessage: "没有匹配的创建人",
        key: "creatorIds" as const,
        options: workspaceMembers.map((member) => ({
          avatarUrl: member.image,
          label: member.name,
          searchValue: `${member.name} ${member.email}`,
          value: member.id,
        })),
        placeholder: "按创建人筛选",
        searchPlaceholder: "搜索姓名或邮箱…",
        selectedFormat: (count: number) => `已选 ${count} 个创建人`,
        type: "multi-select" as const,
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
        selectedPreviewLimit: 2,
        type: "multi-select" as const,
      },
    ],
    [workspaceMembers],
  );

  // 概览统计卡：来自 round 级聚合计数。
  // Summary stat cards: sourced from round-level aggregated counts.
  const stats = (
    <StudioSummaryCards
      loading={summaryQuery.isPending && !summaryQuery.data}
      items={[
        {
          description: "该组织下所有面试轮次总数",
          id: "total",
          label: "总轮数",
          value: `${summary.total}`,
        },
        {
          description: "尚未开始的轮次",
          id: "pending",
          label: "待开始",
          value: `${summary.pending}`,
        },
        {
          description: "正在进行或短暂中断的轮次",
          id: "in-progress",
          label: "进行中",
          value: `${summary.inProgress}`,
        },
        {
          description: "全部完成的轮次",
          id: "completed",
          label: "已完成",
          value: `${summary.completed}`,
        },
      ]}
    />
  );

  // 删除单条：目前以 roundId 调用旧 candidateId 端点，T5 修正前暂时会 404。
  // Delete single: calling old candidateId endpoint with roundId for now — will 404 until T5.
  async function handleDelete() {
    if (!(deleteRecord && canDeleteInterview)) {
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
    if (!canDeleteInterview) {
      return;
    }
    const ids = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]);
    if (ids.length === 0) {
      return;
    }
    setIsBulkDeleting(true);
    await runAsyncAction({
      cleanup: () => setIsBulkDeleting(false),
      onError: (error) => toast.error(error instanceof Error ? error.message : "批量删除失败"),
      operation: async () => {
        const result = await bulkDeleteStudioInterviewRounds(slug, ids);
        toast.success(`已删除 ${result?.deleted ?? ids.length} 条记录`);
        grid.setRowSelection({});
        setBulkDeleteOpen(false);
        invalidateAll();
      },
    });
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="AI 面试" />
        <DataGrid<StudioInterviewRoundListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(r) => r.id}
          columnPinning={{
            end: ["actions"],
            start: canDeleteInterview ? ["select", "candidateName"] : ["candidateName"],
          }}
          filters={filtersConfig}
          headerExtra={stats}
          bulkActions={
            canDeleteInterview
              ? ({ selectedIds }) => (
                  <Button
                    className="flex-1 sm:flex-none"
                    onClick={() => setBulkDeleteOpen(true)}
                    variant="destructive"
                  >
                    <IconTrash className="size-4" />
                    批量删除 ({selectedIds.length})
                  </Button>
                )
              : undefined
          }
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconRobot className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有候选人面试记录</EmptyTitle>
                <EmptyDescription>
                  请前往招聘台创建招聘记录，选择「保存并发起面试」即可创建面试。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  nativeButton={false}
                  render={
                    <Link params={{ slug }} to="/w/$slug/studio/resumes">
                      前往招聘台
                    </Link>
                  }
                />
              </EmptyContent>
            </Empty>
          }
        />
      </div>

      {/* 详情 dialog：列表行点击走 roundId(从 row.id 拿,语义对齐);
          ?recordId= 外部链接走 recordId,Panel 内部 resolver 兜底。
          Row clicks pass roundId (matches row.id semantics); legacy
          ?recordId= URLs pass recordId and rely on the Panel resolver. */}
      <StudioPersonDetailDialog
        mode="interview"
        onOpenChange={(open) => !open && closeDetail()}
        onUpdated={invalidateAll}
        open={detailOpen}
        recordId={detailRecordId}
        roundId={detailRoundId}
      />

      {/* 编辑 dialog：T5 修正写入路径。/ Edit dialog: T5 fixes the write path. */}
      {canUpdateInterview ? (
        <StudioPersonEditDialog
          mode="interview"
          onEditResumeRecord={setResumeEditRecordId}
          onOpenChange={(open) => !open && setEditRecordId(null)}
          onUpdated={invalidateAll}
          open={editRecordId !== null}
          recordId={editRecordId}
        />
      ) : null}

      <StudioPersonEditDialog
        mode="resume"
        onOpenChange={(open) => !open && setResumeEditRecordId(null)}
        onUpdated={invalidateAll}
        open={resumeEditRecordId !== null}
        recordId={resumeEditRecordId}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteRecord(null)}
        open={canDeleteInterview && deleteRecord !== null}
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

      <AlertDialog onOpenChange={setBulkDeleteOpen} open={canDeleteInterview && bulkDeleteOpen}>
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

      {previewRecord
        ? (() => {
            const previewKind = getPreviewableResumeDocumentKind({
              fileName: previewRecord.resumeFileName,
            });
            return previewKind ? (
              <Suspense fallback={null}>
                <ResumeDocumentPreviewDialog
                  filename={previewRecord.resumeFileName ?? undefined}
                  kind={previewKind}
                  onOpenChange={(open) => !open && setPreviewRecord(null)}
                  open={previewRecord !== null}
                  url={`/api/w/${slug}/studio/interviews/${previewRecord.id}/resume`}
                />
              </Suspense>
            ) : null;
          })()
        : null}

      <JobDescriptionViewDialog
        jobDescriptionId={canReadJobDescriptions ? viewJobDescriptionId : null}
        onOpenChange={(open) => !open && setViewJobDescriptionId(null)}
      />
    </>
  );
}
