import { HydrationBoundary, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import {
  ClientOnly,
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { loadStudioResumesState } from "@/lib/start/studio/resumes.functions";
import type { StudioResumesState } from "@/lib/start/studio/resumes.functions";
import { parseCsvParam } from "@arc/shared/csv";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  canLaunchInterviewFromResume,
  describeResumeProgress,
  getResumeActionLockedReason,
} from "@arc/shared/studio-resumes";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
  ResumeLibraryMetrics,
} from "@arc/shared/studio-resumes";
import { pipelineStageMeta, pipelineStageValues } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { BulkUploadConfirmDialog } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { PageHeader } from "@/components/features/studio/page-header";
import { JobDescriptionViewDialog } from "@/components/features/studio/interviews/job-description-view-dialog";
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
import { CreatorCell } from "@/components/data-grid/cells/creator-cell";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  bulkDeleteStudioResumes,
  deleteStudioResume,
  fetchStudioResumeSkillSuggestions,
  fetchStudioResumes,
} from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/components/features/studio/studio-person-edit-dialog";
import { CreateResumeRecordDialog } from "@/components/features/studio/resumes/upload-resume-dialog";
import type { CreateResumeRecordResult } from "@/components/features/studio/resumes/upload-resume-dialog";
import {
  ResumeUploadEntryButton,
  ResumeUploadEntryDialog,
} from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { LaunchInterviewDialog } from "@/components/features/studio/resumes/launch-interview-dialog";
import { ResumeLifecycleBadge } from "@/components/features/studio/resumes/resume-lifecycle-badge";
import { ResumeLibraryCharts } from "@/components/features/studio/resumes/resume-library-charts";
import { TransitionCandidateDialog } from "@/components/features/studio/resumes/transition-candidate-dialog";
import { Skeleton } from "@/components/ui/skeleton";

const PdfPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/pdf/pdf-preview-dialog");
  return { default: mod.PdfPreviewDialog };
});

// 工具栏多选下拉在 state/URL 里以 CSV 字符串编码，符合 data-grid 工具栏约定。
// 「skills」= 候选人必须同时拥有所有选中的技能（AND）；
// 「jdIds」= 关联岗位为所选中任一（OR，因为一份简历只能绑一个岗位）。
// Multi-select toolbar filters are CSV-encoded per the data-grid convention.
// skills = candidate must have ALL selected skills (intersection / AND);
// jdIds = candidate's linked JD is one of the selection (OR — a resume can
//          link to only one JD, so AND would always be empty for >1).
interface ResumeFilters extends Record<string, string> {
  creatorIds: string;
  skills: string;
  jdIds: string;
  stage: string;
}
const EMPTY_FILTERS: ResumeFilters = { creatorIds: "", jdIds: "", skills: "", stage: "" };
type ResumeDetailDefaultTab = "overview" | "rounds" | "human-interview" | "offer";

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

function firstSearchValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

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

function ResumeProgressCell({
  onOpen,
  record,
}: {
  onOpen: () => void;
  record: ResumeLibraryListRecord;
}) {
  const meta = describeLifecycleCell(record);
  const badge = (
    <ResumeLifecycleBadge
      className="w-44"
      detailLabel={meta.detailLabel}
      fullLabel={meta.fullLabel}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      stageLabel={meta.stageLabel}
      tone={meta.tone}
    />
  );

  if (record.resumeParseStatus !== "failed") {
    return badge;
  }

  return (
    <HoverCard closeDelay={120} openDelay={120}>
      <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <div className="flex flex-col gap-2">
          <p className="font-medium text-sm">解析失败原因</p>
          <p className="whitespace-pre-wrap break-words text-muted-foreground text-sm leading-relaxed">
            {record.resumeParseError?.trim() || "后台未返回具体失败原因。"}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
const VISIBLE_PIPELINE_STAGES = pipelineStageValues.filter(
  (s) => !HIDDEN_PIPELINE_STAGE_TABS.has(s),
);

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
function ResumeLibraryPage({ metrics }: { metrics: ResumeLibraryMetrics }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes" });
  const queryClient = useQueryClient();

  // 删除简历会级联清掉关联的 AI 面试轮次；发起面试 / 保存并发起也会改动
  // AI 面试列表。所以这里把两侧 key 一起失效，避免任意一侧停留在脏数据。
  //
  // Resume deletes cascade into interview rounds; launch-and-save also adds
  // rows to the AI 面试 list. Invalidate both sides here so neither view goes
  // stale after a mutation triggered from the resume library.
  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
    void router.invalidate();
  }, [queryClient, router]);

  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [singleUploadFile, setSingleUploadFile] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const bulk = useBulkUpload({
    onBatchQueued: (detail) => {
      setProgressOpen(false);
      setPendingFiles([]);
      void queryClient.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
      toast.success(`${detail.batch.totalCount} 份简历已上传，后台正在解析`);
    },
    onRecordsChanged: invalidateAll,
  });
  const batchListQuery = useQuery({
    queryFn: () => listBulkResumeBatches(slug),
    queryKey: ["bulk-resume-batches", slug],
    refetchInterval: 10_000,
  });
  const libraryBatches = useMemo(
    () =>
      (batchListQuery.data ?? []).filter(
        (batch) => (batch.target ?? "resume_library") === "resume_library",
      ),
    [batchListQuery.data],
  );
  const uploadEntryDisabled = bulk.state.phase === "uploading";
  const hasActiveUploadBatches = libraryBatches.some(
    (batch) => batch.status === "pending" || batch.status === "running",
  );

  useEffect(() => {
    const hasActiveBatch = libraryBatches.some(
      (batch) => batch.status === "pending" || batch.status === "running",
    );
    if (hasActiveBatch) {
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    }
  }, [libraryBatches, queryClient]);

  async function handleOpenBatch(batch: (typeof libraryBatches)[number]) {
    setProgressOpen(true);
    if (batch.status === "pending" || batch.status === "running") {
      await bulk.resume(batch.id);
      return;
    }
    await bulk.view(batch.id);
  }

  const fetcher = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedResumeLibraryResult> =>
        fetchStudioResumes(slug, {
          creatorIds: parseCsvParam(params.filters.creatorIds),
          jobDescriptionIds: parseCsvParam(params.filters.jdIds),
          page: params.page,
          pageSize: params.pageSize,
          pipelineStages: parseCsvParam(params.filters.stage),
          search: params.search || undefined,
          skills: parseCsvParam(params.filters.skills),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        }),
    [slug],
  );

  const { data: workspaceMembersResult } = useQuery({
    queryFn: () =>
      rpcFetch<{ records: WorkspaceMember[] }>(
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
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: EMPTY_FILTERS,
    queryFn: fetcher,
    queryKeyBase: ["studio-resumes", slug],
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
  const consumedRecordIdRef = useRef(false);
  useEffect(() => {
    if (consumedRecordIdRef.current) {
      return;
    }
    const recordIdFromUrl = firstSearchValue(routeSearch.recordId);
    if (!recordIdFromUrl) {
      return;
    }
    consumedRecordIdRef.current = true;
    setEditRecordId(recordIdFromUrl);
    const nextSearch: SearchParamsRecord = { ...routeSearch };
    delete nextSearch.recordId;
    void router.navigate({
      params: { slug },
      replace: true,
      search: nextSearch,
      to: "/w/$slug/studio/resumes",
    });
  }, [routeSearch, router, slug]);

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

  function handleSingleUploadFilePicked(file: File) {
    setSingleUploadFile(file);
    setCreateDialogOpen(true);
  }

  function handleMultipleUploadFilesPicked(files: File[]) {
    setPendingFiles(files);
    setConfirmOpen(true);
  }

  function startAiInterview(record: ResumeLibraryListRecord) {
    if (!canLaunchInterviewFromResume(record.resumeParseStatus)) {
      toast.error("简历解析完成后才能发起 AI 面试");
      return;
    }
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
                  className="group/pdf mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPreviewRecord(r);
                  }}
                  title={pdfTitle}
                  type="button"
                >
                  <PdfFileIcon className="size-8 transition-transform duration-200 group-hover/pdf:scale-105" />
                </button>
              ) : (
                <span
                  aria-disabled="true"
                  aria-label="暂无简历 PDF"
                  className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
                  title="暂无简历 PDF"
                >
                  <PdfFileIcon className="size-8" />
                </span>
              )}
              <div className="min-w-0">
                <button
                  className="block max-w-full truncate text-left font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
                  onClick={() => setDetailRecordId(r.id)}
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
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => {
          const label = r.jobDescriptionName
            ? [r.jobDescriptionDepartmentName, r.jobDescriptionName].filter(Boolean).join(" / ")
            : null;

          return label ? (
            <button
              className="truncate text-left underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
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
          const targetTab = lifecycleTargetTab(r);
          return (
            <ResumeProgressCell
              onOpen={() => {
                setDetailDefaultTab(targetTab);
                setDetailRecordId(r.id);
              }}
              record={r}
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
          {
            label: "编辑",
            onClick: (r) => setEditRecordId(r.id),
            show: (r) => canEditResumeRecord(r.resumeParseStatus),
          },
        ],
        menu: [
          {
            label: "查看简历",
            onClick: (r) => setPreviewRecord(r),
            show: (r) => !canEditResumeRecord(r.resumeParseStatus) && r.hasResumeFile,
          },
          {
            label: "发起 AI 面试",
            onClick: startAiInterview,
            // 已存在任意 AI 面试轮次 或 已结案 时隐藏（已结案的人需要先重新激活）。
            // Hide when the candidate already has any AI interview round OR is
            // closed (closed candidates must be reactivated first).
            show: (r) =>
              canLaunchInterviewFromResume(r.resumeParseStatus) &&
              !r.hasInterviewRounds &&
              r.pipelineStage !== "closed",
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
            show: (r) => canEditResumeRecord(r.resumeParseStatus) && r.pipelineStage !== "closed",
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
            show: (r) => canEditResumeRecord(r.resumeParseStatus) && r.pipelineStage === "closed",
          },
          {
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            show: (r) => canDeleteResumeRecord(r.resumeParseStatus),
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
    [skillSuggestions, jobDescriptions, workspaceMembers],
  );

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    if (!canDeleteResumeRecord(deleteRecord.resumeParseStatus)) {
      toast.error("简历解析中，暂不能删除");
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
    const rowsById = new Map(grid.bind.data.map((row) => [row.id, row]));
    const selectedIds = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]);
    const locked = selectedIds.some((id) => {
      const row = rowsById.get(id);
      return row ? !canDeleteResumeRecord(row.resumeParseStatus) : false;
    });
    if (locked) {
      toast.error("所选记录包含解析中的简历，暂不能删除");
      return;
    }
    const ids = selectedIds;
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
        <ClientOnly fallback={<Skeleton className="h-48 w-full" />}>
          <ResumeLibraryCharts metrics={metrics} />
        </ClientOnly>
        <Tabs
          onValueChange={(value) => grid.setFilter("stage", value === "all" ? "" : value)}
          value={grid.filters.stage || "all"}
        >
          <TabsList className="grid w-full grid-cols-2 h-auto items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-wrap">
            <TabsTrigger
              className="h-auto w-full flex-col items-start gap-0.5 px-3 py-1.5 sm:w-auto sm:px-8"
              value="all"
            >
              <span className="text-sm leading-tight">全部</span>
              <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                {PIPELINE_STAGE_TAB_DESCRIPTIONS.all}
              </span>
            </TabsTrigger>
            {VISIBLE_PIPELINE_STAGES.map((s) => (
              <TabsTrigger
                className="h-auto w-full flex-col items-start gap-0.5 px-3 py-1.5 sm:w-auto sm:px-8"
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
            <ButtonGroup>
              <ResumeUploadEntryButton
                disabled={uploadEntryDisabled}
                onClick={() => setUploadEntryOpen(true)}
              />
              {hasActiveUploadBatches ? (
                <Button onClick={() => setBatchListOpen(true)} type="button">
                  <HistoryIcon className="size-4" />
                </Button>
              ) : null}
            </ButtonGroup>
          }
          bulkActions={({ selectedIds }) => (
            <Button
              className="flex-1 sm:flex-none"
              disabled={selectedIds.some((id) => {
                const row = grid.bind.data.find((record) => record.id === id);
                return row ? !canDeleteResumeRecord(row.resumeParseStatus) : false;
              })}
              onClick={() => setBulkDeleteOpen(true)}
              title={
                selectedIds.some((id) => {
                  const row = grid.bind.data.find((record) => record.id === id);
                  return row ? !canDeleteResumeRecord(row.resumeParseStatus) : false;
                })
                  ? "所选记录包含解析中的简历，暂不能删除"
                  : undefined
              }
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
                  <ResumeUploadEntryButton
                    disabled={uploadEntryDisabled}
                    onClick={() => setUploadEntryOpen(true)}
                  />
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
          const row = grid.bind.data.find((record) => record.id === id);
          const reason = row ? getResumeActionLockedReason(row.resumeParseStatus) : null;
          if (reason) {
            toast.error(reason);
            return;
          }
          setDetailRecordId(null);
          setEditRecordId(id);
        }}
        onLaunchInterview={({ id, candidateName }) => {
          const row = grid.bind.data.find((record) => record.id === id);
          if (row && !canLaunchInterviewFromResume(row.resumeParseStatus)) {
            toast.error("简历解析完成后才能发起 AI 面试");
            return;
          }
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
        <Suspense fallback={null}>
          <PdfPreviewDialog
            filename={previewRecord.resumeFileName ?? undefined}
            onOpenChange={(open) => !open && setPreviewRecord(null)}
            open={previewRecord !== null}
            url={`/api/w/${slug}/studio/resumes/${previewRecord.id}/resume`}
          />
        </Suspense>
      ) : null}

      <JobDescriptionViewDialog
        jobDescriptionId={viewJobDescriptionId}
        onOpenChange={(open) => !open && setViewJobDescriptionId(null)}
      />

      <ResumeUploadEntryDialog
        disabled={uploadEntryDisabled}
        onMultipleFilesPicked={handleMultipleUploadFilesPicked}
        onOpenChange={setUploadEntryOpen}
        onSingleFilePicked={handleSingleUploadFilePicked}
        open={uploadEntryOpen}
      />

      <CreateResumeRecordDialog
        initialFile={singleUploadFile}
        onCreated={handleResumeRecordCreated}
        onMultipleFilesPicked={handleMultipleUploadFilesPicked}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setSingleUploadFile(null);
          }
        }}
        open={createDialogOpen}
      />

      <BulkUploadConfirmDialog
        files={pendingFiles}
        onConfirmed={async (files, config: BulkUploadConfirmConfig) => {
          setConfirmOpen(false);
          setProgressOpen(true);
          setPendingFiles([]);
          await bulk.start(files, config);
        }}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setPendingFiles([]);
          }
        }}
        onRemoveFile={(idx) => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
        open={confirmOpen}
      />

      <UploadBatchListDialog
        batches={libraryBatches}
        isLoading={batchListQuery.isLoading}
        onOpenBatch={handleOpenBatch}
        onOpenChange={setBatchListOpen}
        open={batchListOpen}
      />

      <BulkUploadProgressDialog
        onAbort={() => {
          bulk.abort();
          setProgressOpen(false);
        }}
        onAfterClose={() => {
          void batchListQuery.refetch();
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

type SearchParamsPrimitive = boolean | number | string;
type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is boolean | number | string =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

function parseResumeQuery(searchParams: SearchParamsRecord): DataGridQueryState<ResumeFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", jdIds: "", skills: "", stage: "" },
  });
}

function StudioResumesRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/resumes",
  }) as unknown as StudioResumesState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <ResumeLibraryPage metrics={state.metrics} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes")({
  component: StudioResumesRoute,
  head: () => ({
    meta: [{ title: "简历库" }],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
      params: { slug: string };
    };
    const query = parseResumeQuery(location.search);
    const state = (await loadStudioResumesState({
      data: { query, slug: params.slug },
    })) as StudioResumesState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/resumes`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  shouldReload: false,
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
