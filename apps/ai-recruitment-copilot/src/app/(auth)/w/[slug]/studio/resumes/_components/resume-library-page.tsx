"use client";

import { describeResumeProgress } from "@/lib/shared/studio-resumes";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
  ResumeLibraryMetrics,
} from "@/lib/shared/studio-resumes";
import { pipelineStageMeta, pipelineStageValues } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Trash2Icon, UsersIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PdfFileIcon } from "@/components/pdf-file-icon";
import { cancelBulkResumeBatch } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { ActiveBatchBanner } from "./active-batch-banner";
import { BulkUploadButton } from "./bulk-upload-button";
import { BulkUploadConfirmDialog } from "./bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "./bulk-upload-confirm-dialog";
import { BulkUploadProgressDialog } from "./bulk-upload-progress-dialog";
import { useBulkUpload } from "./use-bulk-upload";
import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { JobDescriptionViewDialog } from "@/app/(auth)/w/[slug]/studio/interviews/_components/job-description-view-dialog";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  selectColumn,
  useDataGridState,
} from "@/components/data-grid";
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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  bulkDeleteStudioResumes,
  deleteStudioResume,
  fetchStudioResumeSkillSuggestions,
  fetchStudioResumes,
} from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { StudioPersonDetailDialog } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-edit-dialog";
import { CreateResumeRecordDialog } from "./upload-resume-dialog";
import type { CreateResumeRecordResult } from "./upload-resume-dialog";
import { LaunchInterviewDialog } from "./launch-interview-dialog";
import { ResumeLifecycleBadge } from "./resume-lifecycle-badge";
import { ResumeLibraryCharts } from "./resume-library-charts";
import { TransitionCandidateDialog } from "./transition-candidate-dialog";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

// 工具栏多选下拉在 state/URL 里以 CSV 字符串编码，符合 data-grid 工具栏约定。
// 「skills」= 候选人必须同时拥有所有选中的技能（AND）；
// 「jdIds」= 关联岗位为所选中任一（OR，因为一份简历只能绑一个岗位）。
// Multi-select toolbar filters are CSV-encoded per the data-grid convention.
// skills = candidate must have ALL selected skills (intersection / AND);
// jdIds = candidate's linked JD is one of the selection (OR — a resume can
//          link to only one JD, so AND would always be empty for >1).
interface ResumeFilters extends Record<string, string> {
  skills: string;
  jdIds: string;
  stage: string;
}
const EMPTY_FILTERS: ResumeFilters = { jdIds: "", skills: "", stage: "" };
type ResumeDetailDefaultTab = "overview" | "rounds" | "human-interview" | "offer";

// pipelineStage tab 副标题文案——简短，避免 tab 撑得过宽，移动端会隐藏。
// Short helper text shown inside each pipelineStage tab; hidden on mobile so
// tabs stay compact in narrow viewports.
const PIPELINE_STAGE_TAB_DESCRIPTIONS: Record<string, string> = {
  ai_interview: "AI 面试阶段",
  all: "全部候选人",
  closed: "已结案候选人",
  human_interview: "等候真人复面",
  offer: "Offer 协商中",
  screening: "简历筛选中",
  written_test: "笔试阶段",
};

// 笔试阶段暂未启用对应的入口/元数据 UI，先在 tabs 中隐藏，避免点进去发现啥也没有。
// schema、后端 API 仍保留，把 UI 建出来后只要从这里删掉对应 key 即可。
// Stages without a working entry UI are hidden from the tabs to avoid empty
// drilldowns. Schema + backend support stays; remove from this set once the
// stage's UI is built.
const HIDDEN_PIPELINE_STAGE_TABS = new Set<string>(["written_test"]);

// 当前环节点进详情时默认跳到对应 tab；没有专属 tab 的阶段回到概览。
// Current lifecycle cell opens the detail dialog at the matching tab. Stages
// without a dedicated tab fall back to overview.
function lifecycleTargetTab(record: ResumeLibraryListRecord): ResumeDetailDefaultTab {
  if (record.pipelineStage === "ai_interview") {
    return "rounds";
  }
  if (record.pipelineStage === "human_interview") {
    return "human-interview";
  }
  if (record.pipelineStage === "offer") {
    return "offer";
  }
  return "overview";
}

function describeCompactAiLifecycle(record: ResumeLibraryListRecord): string {
  const progress = record.stageProgress.aiInterview;
  if (!progress || progress.totalRounds === 0) {
    return "未排期";
  }
  if (!progress.activeRound) {
    return "完成待决策";
  }

  const current = progress.activeRound.sortOrder + 1;
  if (["in_progress", "interrupted"].includes(progress.activeRound.status)) {
    return `${current}/${progress.totalRounds} 进行中`;
  }
  if (progress.hasStarted) {
    return `${current}/${progress.totalRounds} 待下轮`;
  }
  return `${current}/${progress.totalRounds} 待进场`;
}

function describeCompactHumanLifecycle(record: ResumeLibraryListRecord): string {
  const progress = record.stageProgress.humanInterview;
  if (!progress || progress.totalRounds === 0) {
    return "未安排";
  }
  if (!progress.activeRound) {
    return `${progress.passedRounds}/${progress.totalRounds}通过待决策`;
  }

  const current = progress.activeRound.sortOrder + 1;
  if (progress.activeRound.scheduledAt) {
    return `${current}/${progress.totalRounds} 已安排`;
  }
  return `${current}/${progress.totalRounds} 待安排`;
}

function describeCompactOfferLifecycle(record: ResumeLibraryListRecord): string {
  const progress = record.stageProgress.offer;
  const draft = progress?.latestDraft;
  if (!progress || !draft) {
    return "待发出";
  }

  const version = progress.totalVersions > 1 ? `v${draft.version} ` : "";
  switch (draft.status) {
    case "draft": {
      return `${version}草稿`;
    }
    case "sent": {
      return `${version}已发待回复`;
    }
    case "accepted": {
      return `${version}接受待结案`;
    }
    case "declined": {
      return `${version}已拒绝`;
    }
    case "expired": {
      return `${version}已过期`;
    }
    default: {
      return `${version}待回复`;
    }
  }
}

function describeCompactLifecycleDetail(
  record: ResumeLibraryListRecord,
  fallback: string | null,
): string | null {
  if (record.pipelineStage === "ai_interview") {
    return describeCompactAiLifecycle(record);
  }
  if (record.pipelineStage === "human_interview") {
    return describeCompactHumanLifecycle(record);
  }
  if (record.pipelineStage === "offer") {
    return describeCompactOfferLifecycle(record);
  }
  return fallback;
}

function describeLifecycleCell(record: ResumeLibraryListRecord) {
  const progress = describeResumeProgress(record);
  const [stageLabel, ...detailParts] = progress.label.split(" · ");

  return {
    detailLabel: describeCompactLifecycleDetail(record, detailParts.join(" · ") || null),
    fullLabel: progress.label,
    stageLabel,
    tone: progress.tone,
  };
}
const VISIBLE_PIPELINE_STAGES = pipelineStageValues.filter(
  (s) => !HIDDEN_PIPELINE_STAGE_TABS.has(s),
);

function csvToArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: ResumeFilters;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

// 页面组件天然汇聚多种 dialog/state，复杂度阈值（20）会被踩到。
// 这是 UI 编排层，不是业务逻辑层；拆成更小组件会牺牲就近可读性。
// Page-level orchestrator naturally aggregates dialogs and state; splitting
// would harm local readability without reducing real complexity.
// oxlint-disable-next-line eslint/complexity
export function ResumeLibraryPage({
  initialData,
  metrics,
}: {
  initialData: PaginatedResumeLibraryResult;
  metrics: ResumeLibraryMetrics;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  const bulk = useBulkUpload();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);

  // 继续之前没跑完的批次：复活孤儿 → 打开进度 dialog → 拉起循环。
  // Resume a stale batch: revive orphans, open progress, restart loop.
  async function handleContinueBatch(batchId: string) {
    setProgressOpen(true);
    await bulk.resume(batchId);
  }

  async function handleCancelActiveBatch(batchId: string) {
    try {
      await cancelBulkResumeBatch(slug, batchId);
      toast.success("批次已取消");
      void queryClient.invalidateQueries({ queryKey: ["active-bulk-batch", slug] });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消失败");
    }
  }

  const fetcher = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedResumeLibraryResult> =>
        fetchStudioResumes(slug, {
          jobDescriptionIds: csvToArray(params.filters.jdIds),
          page: params.page,
          pageSize: params.pageSize,
          pipelineStages: params.filters.stage ? [params.filters.stage] : undefined,
          search: params.search || undefined,
          skills: csvToArray(params.filters.skills),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        }),
    [slug],
  );

  // 关联岗位 + 技能两组下拉建议数据；都是 staleTime 60s 的轻量查询，
  // 单独缓存以便其他页面（发起面试 dialog 等）复用 ["job-descriptions","all"] key。
  // JD list + skill suggestions for the two filter dropdowns. Reusing the
  // ["job-descriptions","all"] cache key keeps it shared with other consumers.
  const { data: jobDescriptions = [] } = useQuery({
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"].all.$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = (await response.json()) as {
        records: { id: string; name: string; departmentName: string | null }[];
      };
      return payload.records;
    },
    queryKey: ["job-descriptions", "all", slug],
    staleTime: 60_000,
  });

  const { data: skillSuggestions = [] } = useQuery({
    queryFn: async () => {
      const result = await fetchStudioResumeSkillSuggestions(slug, { limit: 100 });
      return result.records;
    },
    queryKey: ["studio-resumes", "skill-suggestions", slug],
    staleTime: 60_000,
  });

  const grid = useDataGridState<ResumeLibraryListRecord, ResumeFilters>({
    defaultSorting: [{ desc: true, id: "createdAt" }],
    fetcher,
    initialData,
    initialFilters: EMPTY_FILTERS,
    namespace: "studio-resumes",
  });

  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  // 中文：打开简历详情弹窗时默认聚焦的 tab；点「当前环节」直接跳到对应流程 tab。
  // English: Default tab when opening the resume detail dialog — clicking
  // 当前环节 jumps straight to the matching lifecycle tab.
  const [detailDefaultTab, setDetailDefaultTab] = useState<ResumeDetailDefaultTab>("overview");
  // 「保存并发起面试」成功后打开的 AI 面试详情弹窗对应的 round id；为 null 则不展示。
  // Round id whose AI interview detail dialog should pop after a successful
  // save-and-start; null hides the dialog.
  const [interviewRoundDetailId, setInterviewRoundDetailId] = useState<string | null>(null);
  const [interviewDetailDefaultTab, setInterviewDetailDefaultTab] = useState<
    "overview" | "reports"
  >("overview");
  // 当前正在「发起 AI 面试」弹窗中处理的简历记录（最小投影：行菜单和详情
  // 弹窗都通过这里触发）；null 则不展示。
  // Minimal record handle driving the launch-interview dialog. Both the row
  // menu and the resume detail dialog feed into this state; null hides it.
  const [launchingRecord, setLaunchingRecord] = useState<{
    id: string;
    candidateName: string | null;
  } | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  // 标记结案 / 重新激活 dialog 的目标候选人；mode 决定 UI 内容。
  // initialOutcome 用于「Offer 接受后一键标记录用」等场景，dialog 打开时预选。
  // Close-or-reactivate dialog target. initialOutcome pre-selects an outcome
  // for flows like "offer accepted → mark as hired".
  const [transitionTarget, setTransitionTarget] = useState<{
    candidate: { id: string; candidateName: string | null };
    mode: "close" | "reactivate";
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  } | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumeLibraryListRecord | null>(null);
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // 中文：从 AI 面试详情/编辑里点「编辑候选人信息」跳转过来时，URL 为
  // `/studio/resumes?recordId=xxx`；自动打开 EditResumeDialog 并清掉参数，
  // 避免刷新/分享时反复触发。
  // English: when arriving via an external link shaped like `?recordId=xxx`
  // (from the AI 面试 dialog's edit-candidate jump), auto-open the edit
  // dialog and strip the param so refresh/share doesn't re-trigger.
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
    setEditRecordId(recordIdFromUrl);
    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("recordId");
    const query = remaining.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [searchParams]);

  // 删除简历会级联清掉关联的 AI 面试轮次；发起面试 / 保存并发起也会改动
  // AI 面试列表。所以这里把两侧 key 一起失效，避免任意一侧停留在脏数据。
  //
  // Resume deletes cascade into interview rounds; launch-and-save also adds
  // rows to the AI 面试 list. Invalidate both sides here so neither view goes
  // stale after a mutation triggered from the resume library.
  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
  }

  // 保存：仅刷新列表。
  // 保存并发起面试：刷新列表 + 立即打开该轮次的 AI 面试详情弹窗，
  // 让用户能马上确认排期 / 复制邀请链接 / 查看生成的面试题。
  //
  // Save-only: refresh list. Save-and-start: refresh list AND pop the newly
  // created round's AI interview detail dialog so the user can confirm the
  // schedule, copy the invite link, and review generated questions in place.
  function handleResumeRecordCreated(result: CreateResumeRecordResult) {
    invalidateAll();
    if (result.mode === "save-and-start") {
      setInterviewDetailDefaultTab("overview");
      setInterviewRoundDetailId(result.round.id);
    }
  }

  function startAiInterview(record: ResumeLibraryListRecord) {
    setLaunchingRecord({ candidateName: record.candidateName ?? null, id: record.id });
  }

  const columns = useMemo(
    () => [
      selectColumn<ResumeLibraryListRecord>(),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => {
          const pdfTitle = r.resumeFileName ?? "查看简历 PDF";
          return (
            <div className="flex min-w-0 items-start gap-2">
              {r.hasResumeFile ? (
                <button
                  aria-label={pdfTitle}
                  className="mt-0.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewRecord(r);
                  }}
                  title={pdfTitle}
                  type="button"
                >
                  <PdfFileIcon className="size-8" />
                </button>
              ) : (
                <span
                  aria-disabled="true"
                  aria-label="暂无简历 PDF"
                  className="mt-0.5 inline-flex size-8 shrink-0 cursor-not-allowed items-center justify-center rounded-md opacity-45 grayscale"
                  title="暂无简历 PDF"
                >
                  <PdfFileIcon className="size-8" />
                </span>
              )}
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
            </div>
          );
        },
        key: "candidateName",
        size: 240,
        title: "候选人",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => {
          const label = r.jobDescriptionName
            ? [r.jobDescriptionDepartmentName, r.jobDescriptionName].filter(Boolean).join(" / ")
            : null;

          return label ? (
            <button
              className="cursor-pointer truncate text-left underline-offset-4 hover:underline"
              onClick={() => r.jobDescriptionId && setViewJobDescriptionId(r.jobDescriptionId)}
              type="button"
            >
              {label}
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
        key: "jobDescriptionName",
        title: "关联岗位",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => {
          const meta = describeLifecycleCell(r);
          const targetTab = lifecycleTargetTab(r);
          return (
            <ResumeLifecycleBadge
              className="w-44"
              detailLabel={meta.detailLabel}
              fullLabel={meta.fullLabel}
              onClick={(e) => {
                e.stopPropagation();
                setDetailDefaultTab(targetTab);
                setDetailRecordId(r.id);
              }}
              stageLabel={meta.stageLabel}
              tone={meta.tone}
            />
          );
        },
        key: "progress",
        size: 220,
        title: "当前环节",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => <CreatorCell image={r.creatorImage} name={r.creatorName} />,
        key: "creatorName",
        title: "创建人",
      }),
      dateColumn<ResumeLibraryListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      dateColumn<ResumeLibraryListRecord>({
        emptyText: "—",
        key: "lastInterviewAt",
        title: "最近面试时间",
      }),
      actionsColumn<ResumeLibraryListRecord>({
        inline: [
          {
            label: "查看",
            onClick: (r) => {
              setDetailDefaultTab("overview");
              setDetailRecordId(r.id);
            },
          },
          { label: "编辑", onClick: (r) => setEditRecordId(r.id) },
        ],
        menu: [
          {
            label: "发起 AI 面试",
            onClick: startAiInterview,
            // 已存在任意 AI 面试轮次 或 已结案 时隐藏（已结案的人需要先重新激活）。
            // Hide when the candidate already has any AI interview round OR is
            // closed (closed candidates must be reactivated first).
            show: (r) => !r.hasInterviewRounds && r.pipelineStage !== "closed",
          },
          {
            label: "标记结案",
            onClick: (r) =>
              setTransitionTarget({
                candidate: { candidateName: r.candidateName, id: r.id },
                mode: "close",
              }),
            // 只在未结案候选人上显示。
            // Only available on non-closed candidates.
            show: (r) => r.pipelineStage !== "closed",
          },
          {
            label: "重新激活",
            onClick: (r) =>
              setTransitionTarget({
                candidate: { candidateName: r.candidateName, id: r.id },
                mode: "reactivate",
              }),
            // 仅对已结案候选人可见。
            // Only visible for closed candidates.
            show: (r) => r.pipelineStage === "closed",
          },
          {
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            variant: "destructive",
          },
        ],
      }),
    ],
    // startAiInterview captures setLaunchingRecord which is stable; safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、邮箱、电话、简历名或目标岗位",
        type: "search" as const,
      },
      {
        emptyMessage: "没有匹配的技能",
        key: "skills" as const,
        options: skillSuggestions.map((item) => ({
          description: `${item.count} 位候选人`,
          label: item.skill,
          value: item.skill,
        })),
        placeholder: "按技能筛选（需同时具备）",
        searchPlaceholder: "搜索技能…",
        selectedFormat: (count: number) => `已选 ${count} 个技能（同时具备）`,
        type: "multi-select" as const,
      },
      {
        emptyMessage: "没有匹配的岗位",
        key: "jdIds" as const,
        options: jobDescriptions.map((jd) => ({
          label: jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name,
          value: jd.id,
        })),
        placeholder: "按关联岗位筛选",
        searchPlaceholder: "搜索岗位或部门…",
        selectedFormat: (count: number) => `已选 ${count} 个岗位`,
        type: "multi-select" as const,
      },
    ],
    [skillSuggestions, jobDescriptions],
  );

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    try {
      await deleteStudioResume(slug, deleteRecord.id);
      setDeleteRecord(null);
      toast.success("简历已删除");
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
      const result = await bulkDeleteStudioResumes(slug, ids);
      toast.success(`已删除 ${result.deleted ?? ids.length} 条记录`);
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
          title="简历库"
          description="沉淀候选人档案、简历 PDF、岗位匹配和流程进展，筛选到面试推进都能从这里接上。"
        />
        <ResumeLibraryCharts metrics={metrics} />
        <ActiveBatchBanner onCancel={handleCancelActiveBatch} onContinue={handleContinueBatch} />
        <Tabs
          onValueChange={(value) => grid.setFilter("stage", value === "all" ? "" : value)}
          value={grid.filters.stage || "all"}
        >
          <TabsList className="h-auto flex-wrap items-stretch data-[orientation=horizontal]:h-auto">
            <TabsTrigger
              className="h-auto flex-col items-start gap-0.5 px-3 py-1.5 sm:px-8"
              value="all"
            >
              <span className="text-sm leading-tight">全部</span>
              <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                {PIPELINE_STAGE_TAB_DESCRIPTIONS.all}
              </span>
            </TabsTrigger>
            {VISIBLE_PIPELINE_STAGES.map((s) => (
              <TabsTrigger
                className="h-auto flex-col items-start gap-0.5 px-3 py-1.5 sm:px-8"
                key={s}
                value={s}
              >
                <span className="text-sm leading-tight">{pipelineStageMeta[s].label}</span>
                <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                  {PIPELINE_STAGE_TAB_DESCRIPTIONS[s]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <DataGrid<ResumeLibraryListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(r) => r.id}
          columnPinning={{ left: ["select", "candidateName"], right: ["actions"] }}
          filters={filtersConfig}
          toolbarRight={
            <div className="flex flex-wrap gap-2">
              <BulkUploadButton
                disabled={
                  Boolean(bulk.state.detail) &&
                  bulk.state.phase !== "idle" &&
                  bulk.state.phase !== "completed" &&
                  bulk.state.phase !== "cancelled"
                }
                onFilesPicked={(files) => {
                  setPendingFiles(files);
                  setConfirmOpen(true);
                }}
              />
              <CreateResumeRecordDialog onCreated={handleResumeRecordCreated} />
            </div>
          }
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
            grid.filters.stage ? (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>
                    暂无处于「
                    {pipelineStageMeta[grid.filters.stage as PipelineStage]?.label ??
                      grid.filters.stage}
                    」阶段的候选人
                  </EmptyTitle>
                  <EmptyDescription>切换到其他阶段或「全部」查看更多候选人。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>简历库还没有任何候选人</EmptyTitle>
                  <EmptyDescription>点击右上角「上传简历」加入第一份候选人简历。</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <CreateResumeRecordDialog onCreated={handleResumeRecordCreated} />
                </EmptyContent>
              </Empty>
            )
          }
        />
      </div>

      <StudioPersonDetailDialog
        defaultTab={detailDefaultTab}
        mode="resume"
        onEdit={(id) => {
          setDetailRecordId(null);
          setEditRecordId(id);
        }}
        onLaunchInterview={({ id, candidateName }) => {
          setDetailRecordId(null);
          setLaunchingRecord({ candidateName, id });
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDetailRecordId(null);
            setDetailDefaultTab("overview");
          }
        }}
        // Action bar 触发：复用现有 transitionTarget state + TransitionCandidateDialog。
        // 不关详情面板——dialog 用 Radix stacking 叠在上面。
        // Action bar reuses the existing TransitionCandidateDialog stacked over the detail panel.
        onRequestClose={({ id, candidateName, initialOutcome }) =>
          setTransitionTarget({
            candidate: { candidateName, id },
            initialOutcome,
            mode: "close",
          })
        }
        onRequestReactivate={(candidate) =>
          setTransitionTarget({
            candidate,
            mode: "reactivate",
          })
        }
        onUpdated={invalidateAll}
        onViewRoundDetail={(roundId) => {
          // 中文：不要关闭简历详情弹窗 — 用户可能看完单轮后还想回来看其他轮次。
          // 两个 Dialog 叠着放，Radix 自动处理 stacking。
          // English: Keep the resume detail dialog open underneath — user may
          // want to come back to view other rounds after viewing one.
          // Radix Dialogs stack natively.
          setInterviewDetailDefaultTab("reports");
          setInterviewRoundDetailId(roundId);
        }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />

      {/* 「保存并发起面试」/「发起 AI 面试」成功后弹出的 AI 面试详情弹窗。
          recordId 在 interview 模式下即 round id。
          AI interview detail dialog opened after save-and-start *or* the
          launch-interview flow from the resume library row menu. recordId is
          the round id when mode="interview". */}
      <StudioPersonDetailDialog
        defaultTab={interviewDetailDefaultTab}
        mode="interview"
        onOpenChange={(open) => {
          if (!open) {
            setInterviewRoundDetailId(null);
            setInterviewDetailDefaultTab("overview");
          }
        }}
        onUpdated={invalidateAll}
        open={interviewRoundDetailId !== null}
        recordId={interviewRoundDetailId}
      />

      <LaunchInterviewDialog
        candidateName={launchingRecord?.candidateName ?? null}
        onLaunched={(round) => {
          invalidateAll();
          setInterviewDetailDefaultTab("overview");
          setInterviewRoundDetailId(round.id);
        }}
        onOpenChange={(open) => !open && setLaunchingRecord(null)}
        open={launchingRecord !== null}
        recordId={launchingRecord?.id ?? null}
      />

      <TransitionCandidateDialog
        candidate={transitionTarget?.candidate ?? null}
        initialOutcome={transitionTarget?.initialOutcome}
        mode={transitionTarget?.mode ?? "close"}
        onCompleted={invalidateAll}
        onOpenChange={(open) => !open && setTransitionTarget(null)}
        open={transitionTarget !== null}
      />

      {/* StudioPersonEditDialog.onUpdated 需要接收最新记录，此处忽略参数仅刷新列表。
          StudioPersonEditDialog.onUpdated receives the updated record; we discard it and just invalidate. */}
      <StudioPersonEditDialog
        mode="resume"
        onOpenChange={(open) => !open && setEditRecordId(null)}
        onUpdated={() => invalidateAll()}
        open={editRecordId !== null}
        recordId={editRecordId}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这条简历？</AlertDialogTitle>
            <AlertDialogDescription>
              将一并删除该候选人下所有关联数据（包括已发起的 AI 面试轮次与对话记录）。当前记录：
              {deleteRecord?.candidateName ?? "未知候选人"}。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setBulkDeleteOpen} open={bulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              确认批量删除{" "}
              {Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]).length} 条简历？
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。所选记录及其关联面试数据将一并级联删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBulkDeleting}
              onClick={(e) => {
                e.preventDefault();
                void handleBulkDelete();
              }}
              variant="destructive"
            >
              {isBulkDeleting ? "正在删除…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewRecord ? (
        <PdfPreviewDialog
          filename={previewRecord.resumeFileName ?? undefined}
          onOpenChange={(open) => !open && setPreviewRecord(null)}
          open={previewRecord !== null}
          url={`/api/w/${slug}/studio/resumes/${previewRecord.id}/resume`}
        />
      ) : null}

      <JobDescriptionViewDialog
        jobDescriptionId={viewJobDescriptionId}
        onOpenChange={(open) => !open && setViewJobDescriptionId(null)}
      />

      <BulkUploadConfirmDialog
        files={pendingFiles}
        onConfirmed={async (files, config: BulkUploadConfirmConfig) => {
          setConfirmOpen(false);
          setProgressOpen(true);
          await bulk.start(files, config);
        }}
        onOpenChange={setConfirmOpen}
        onRemoveFile={(idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
        open={confirmOpen}
      />

      <BulkUploadProgressDialog
        onAbort={() => {
          bulk.abort();
          setProgressOpen(false);
        }}
        onCancel={async () => {
          await bulk.cancel();
          setProgressOpen(false);
          toast.success("批次已取消");
        }}
        onOpenChange={(open) => {
          if (!open) {
            // 关闭=暂停（非终态时）；用户已经在 dialog 内点过取消则状态已是终态。
            // Closing == pause (non-terminal); cancel button handled by the dialog itself.
            if (bulk.state.phase !== "completed" && bulk.state.phase !== "cancelled") {
              bulk.abort();
            }
            setProgressOpen(false);
          }
        }}
        onResume={async () => {
          if (bulk.state.detail) {
            await bulk.resume(bulk.state.detail.batch.id);
          }
        }}
        open={progressOpen}
        state={bulk.state}
      />
    </>
  );
}
