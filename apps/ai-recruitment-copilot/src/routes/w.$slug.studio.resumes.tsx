import {
  IconArrowBackUp,
  IconBriefcase,
  IconCircleOff,
  IconDots,
  IconEdit,
  IconEye,
  IconHistory,
  IconMail,
  IconMessage2,
  IconPhone,
  IconSparkles,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react";
import AvvvatarsModule from "avvvatars-react";
import {
  HydrationBoundary,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { TimeDisplay } from "@/components/features/display/time-display";
import { ResumeDuplicateMatchesDialog } from "@/components/features/resume/resume-dedup-overlay";
import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { BulkUploadConfirmDialog } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import type { BulkUploadConfirmConfig } from "@/components/features/studio/resumes/bulk-upload-confirm-dialog";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { PageHeader } from "@/components/features/studio/page-header";
import { JobDescriptionViewDialog } from "@/components/features/studio/interviews/job-description-view-dialog";
import { useDataGridState } from "@/components/data-grid";
import type { ToolbarFilterConfig } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  fetchStudioResumeDuplicateMatches,
  fetchStudioResumeSkillSuggestions,
  fetchStudioResumes,
} from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { authClient } from "@/lib/client/auth-client";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import { useWorkspaceMemberRole, useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/components/features/studio/studio-person-edit-dialog";
import { StudioResumeFloatingChat } from "@/components/features/studio/studio-resume-floating-chat";
import { openStudioResumeChat } from "@/components/features/studio/studio-resume-chat";
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
import {
  getPreviewableResumeDocumentKind,
  isPreviewableResumeDocumentInput,
} from "@/components/features/resume/resume-document-preview-button";
import {
  formatResumeEducationItem,
  sortResumeEducationExperiences,
} from "@arc/shared/resume-education";
import { cn } from "@arc/shared/utils";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

const Avvvatars =
  typeof AvvvatarsModule === "function"
    ? AvvvatarsModule
    : (AvvvatarsModule as unknown as { default: typeof AvvvatarsModule }).default;

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

function textOrDash(value: string | null | undefined) {
  const text = value?.trim();
  return text || "—";
}

function formatResumeCardContact(value: string | null | undefined, fallback: string) {
  const text = value?.trim();
  return text || fallback;
}

function getCreatorInitial(name: string | null | undefined) {
  return name?.trim().slice(0, 1).toUpperCase() || "?";
}

function getResumeLibraryJobDescriptionLabel(record: ResumeLibraryListRecord) {
  return record.jobDescriptionName
    ? [record.jobDescriptionDepartmentName, record.jobDescriptionName].filter(Boolean).join(" / ")
    : null;
}

function canCopyResumeDetailLink({
  currentMemberRole,
  currentUserId,
  record,
}: {
  currentMemberRole: string;
  currentUserId: string | null;
  record: ResumeLibraryListRecord;
}) {
  return (
    currentMemberRole === "owner" ||
    currentMemberRole === "admin" ||
    (Boolean(currentUserId) && record.createdBy === currentUserId)
  );
}

async function copyResumeDetailLink(slug: string, record: ResumeLibraryListRecord) {
  const fullLink = toAbsoluteUrl(`/resume-review/${slug}/${record.id}`);
  try {
    const result = await copyTextToClipboard(fullLink);
    if (result === "copied") {
      toast.success("详情链接已复制");
      return;
    }
    if (result === "manual") {
      toast.info("已弹出链接，请手动复制");
      return;
    }
    throw new Error("copy-failed");
  } catch {
    toast.error("复制失败，请手动复制");
  }
}

function duplicateMatchBadge(record: ResumeLibraryListRecord, onClick?: () => void) {
  if (!record.duplicateMatch) {
    return null;
  }
  const label =
    record.duplicateMatch.count > 1 ? `疑似重复 ${record.duplicateMatch.count} 条` : "疑似重复";
  const variant = record.duplicateMatch.highestLevel === "high" ? "destructive" : "secondary";
  return onClick ? (
    <Badge asChild className="shrink-0 cursor-pointer" variant={variant}>
      <button
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }}
        type="button"
      >
        {label}
      </button>
    </Badge>
  ) : (
    <Badge className="shrink-0" variant={variant}>
      {label}
    </Badge>
  );
}

const VISIBLE_PIPELINE_STAGES = pipelineStageValues.filter(
  (s) => !HIDDEN_PIPELINE_STAGE_TABS.has(s),
);
const RESUME_LIBRARY_INFINITE_PAGE_SIZE = 20;
const RESUME_LIBRARY_CARD_ESTIMATED_SIZE = 190;
const RESUME_PROFILE_PLACEHOLDER = "未发现信息";

function findVerticalScrollParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

interface ResumeCardProfileSnapshotLine {
  period: string | null;
  primary: string;
  secondary: string | null;
}

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: ResumeFilters;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

type ResumeLibraryGridState = ReturnType<
  typeof useDataGridState<ResumeLibraryListRecord, ResumeFilters>
>;

function getResumeAvatarValue(record: ResumeLibraryListRecord) {
  return [record.candidateName, record.candidateEmail].filter(Boolean).join(" ") || record.id;
}

function getResumeCardSkills(record: ResumeLibraryListRecord): string[] {
  const seen = new Set<string>();
  return (record.resumeProfile?.skills ?? [])
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function cleanResumeProfileText(value: string | null | undefined) {
  const text = value?.trim();
  return text && text !== RESUME_PROFILE_PLACEHOLDER ? text : null;
}

function formatResumeCardPeriod(value: string | null | undefined) {
  const text = cleanResumeProfileText(value);
  if (!text) {
    return null;
  }
  const dateTokens = [...text.matchAll(/(\d{4})\s*[./年-]\s*(\d{1,2})\s*月?/gu)]
    .map(([, year, rawMonth]) => {
      const month = Number(rawMonth);
      return month >= 1 && month <= 12 ? `${year}.${month.toString().padStart(2, "0")}` : null;
    })
    .filter((item): item is string => item !== null);

  if (dateTokens.length === 0) {
    const years = [...text.matchAll(/(?:^|[^\d])(\d{4})(?=$|[^\d])/gu)].map((match) => match[1]);
    if (years.length === 0) {
      return text;
    }
    if (years.length === 1 && /(至今|现在|目前|present|current)/iu.test(text)) {
      return `${years[0]} - 至今`;
    }
    return years.slice(0, 2).join(" - ");
  }

  if (dateTokens.length === 1 && /(至今|现在|目前|present|current)/iu.test(text)) {
    return `${dateTokens[0]} - 至今`;
  }
  return dateTokens.slice(0, 2).join(" - ");
}

function getLatestWorkLine(record: ResumeLibraryListRecord) {
  const work = (record.resumeProfile?.workExperiences ?? []).find(
    (item) => cleanResumeProfileText(item.company) || cleanResumeProfileText(item.role),
  );
  if (!work) {
    return null;
  }
  const company = cleanResumeProfileText(work.company);
  const role = cleanResumeProfileText(work.role);
  const primary = company ?? role;
  if (!primary) {
    return null;
  }
  return {
    period: formatResumeCardPeriod(work.period),
    primary,
    secondary: company ? role : null,
  };
}

function getLatestEducationLine(record: ResumeLibraryListRecord) {
  const [education] = sortResumeEducationExperiences(record.resumeProfile?.educationExperiences);
  if (education) {
    const item = formatResumeEducationItem(education);
    if (item) {
      return {
        period:
          formatResumeCardPeriod(education.period) ??
          formatResumeCardPeriod(education.graduationYear),
        primary: item.school,
        secondary: [item.major, item.level].filter(Boolean).join(" · ") || null,
      };
    }
  }
  const school = record.resumeProfile?.schools.map(cleanResumeProfileText).find(Boolean);
  return school ? { period: null, primary: school, secondary: null } : null;
}

function getResumeCardProfileSnapshot(record: ResumeLibraryListRecord) {
  return {
    education: getLatestEducationLine(record),
    work: getLatestWorkLine(record),
  };
}

function getResumeCardSummary(record: ResumeLibraryListRecord): string | null {
  return record.resumeReview?.overall.conclusion ?? record.notes?.trim() ?? null;
}

function ResumeCardMetaItem({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span aria-hidden className="inline-flex shrink-0 items-center text-muted-foreground/70">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function ResumeCardMetaSeparator() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-border" />;
}

function ResumeCardCreatorMeta({ image, name }: { image: string | null; name: string | null }) {
  const displayName = textOrDash(name);

  return (
    <span className="inline-flex h-6 min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <Avatar size="sm" className="size-4!">
        {image ? <AvatarImage alt={displayName} src={image} /> : null}
        <AvatarFallback>{getCreatorInitial(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate">{displayName}</span>
    </span>
  );
}

function ResumeCardProfileSnapshot({
  snapshot,
}: {
  snapshot: {
    education: ResumeCardProfileSnapshotLine | null;
    work: ResumeCardProfileSnapshotLine | null;
  };
}) {
  if (!(snapshot.work || snapshot.education)) {
    return <div className="hidden xl:block" />;
  }

  return (
    <div className="ml-22 grid min-w-0 content-start gap-1 text-sm xl:ml-0 xl:max-w-sm xl:self-start xl:pt-8.5">
      {[snapshot.work, snapshot.education].map((line) =>
        line ? (
          <p
            className="flex min-w-0 items-baseline gap-2"
            key={`${line.primary}-${line.secondary ?? ""}-${line.period ?? ""}`}
            title={[line.period, line.primary, line.secondary].filter(Boolean).join(" · ")}
          >
            {line.period ? (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {line.period}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-foreground text-sm">
              {[line.primary, line.secondary].filter(Boolean).join(" · ")}
            </span>
          </p>
        ) : null,
      )}
    </div>
  );
}

interface ResumeLibraryCardProps {
  canCreateChat: boolean;
  canCreateInterview: boolean;
  canDeleteResumeLibrary: boolean;
  canUpdateResumeLibrary: boolean;
  currentMemberRole: string;
  currentUserId: string | null;
  onCopyDetailLink: (record: ResumeLibraryListRecord) => void;
  onDelete: (record: ResumeLibraryListRecord) => void;
  onEdit: (record: ResumeLibraryListRecord) => void;
  onLaunchChat: (record: ResumeLibraryListRecord) => void;
  onLaunchInterview: (record: ResumeLibraryListRecord) => void;
  onOpenDetail: (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => void;
  onPreviewResume: (record: ResumeLibraryListRecord) => void;
  onSelectChange: (checked: boolean) => void;
  onShowDuplicateMatches: (record: ResumeLibraryListRecord) => void;
  onTransition: (record: ResumeLibraryListRecord, mode: "close" | "reactivate") => void;
  onViewJobDescription: (id: string) => void;
  record: ResumeLibraryListRecord;
  selected: boolean;
}

type ResumeLibraryCardActionsProps = Pick<
  ResumeLibraryCardProps,
  | "canCreateChat"
  | "canCreateInterview"
  | "canDeleteResumeLibrary"
  | "canUpdateResumeLibrary"
  | "onCopyDetailLink"
  | "onDelete"
  | "onEdit"
  | "onLaunchChat"
  | "onLaunchInterview"
  | "onOpenDetail"
  | "onPreviewResume"
  | "onTransition"
  | "record"
> & {
  canCopyLink: boolean;
};

function ResumeLibraryIconActionButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip delayDuration={700}>
      <TooltipTrigger asChild>
        <Button aria-label={label} onClick={onClick} size="icon" type="button" variant="ghost">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function ResumeLibraryCardActions({
  canCopyLink,
  canCreateChat,
  canCreateInterview,
  canDeleteResumeLibrary,
  canUpdateResumeLibrary,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchChat,
  onLaunchInterview,
  onOpenDetail,
  onPreviewResume,
  onTransition,
  record,
}: ResumeLibraryCardActionsProps) {
  const canEdit = canUpdateResumeLibrary && canEditResumeRecord(record.resumeParseStatus);
  const canDelete = canDeleteResumeLibrary && canDeleteResumeRecord(record.resumeParseStatus);
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canLaunchInterview =
    canCreateInterview &&
    canLaunchInterviewFromResume(record.resumeParseStatus) &&
    !record.hasInterviewRounds &&
    record.pipelineStage !== "closed";
  const canPreviewFromMenu =
    !canEditResumeRecord(record.resumeParseStatus) && record.hasResumeFile && previewable;
  const canClose =
    canUpdateResumeLibrary &&
    canEditResumeRecord(record.resumeParseStatus) &&
    record.pipelineStage !== "closed";
  const canReactivate =
    canUpdateResumeLibrary &&
    canEditResumeRecord(record.resumeParseStatus) &&
    record.pipelineStage === "closed";

  return (
    <div className="flex justify-end self-center">
      <div className="flex items-center justify-end gap-1 xl:flex-col xl:items-center">
        <ResumeLibraryIconActionButton
          label="查看"
          onClick={() => onOpenDetail(record, "overview")}
        >
          <IconEye className="size-4" />
        </ResumeLibraryIconActionButton>
        {canEdit ? (
          <ResumeLibraryIconActionButton label="编辑" onClick={() => onEdit(record)}>
            <IconEdit className="size-4" />
          </ResumeLibraryIconActionButton>
        ) : null}
        {canLaunchInterview ? (
          <ResumeLibraryIconActionButton
            label="发起 AI 面试"
            onClick={() => onLaunchInterview(record)}
          >
            <IconSparkles className="size-4" />
          </ResumeLibraryIconActionButton>
        ) : null}
        <DropdownMenu modal={false}>
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button aria-label="更多操作" size="icon" type="button" variant="ghost">
                  <IconDots className="size-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">更多操作</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>更多操作</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {canCopyLink ? (
              <DropdownMenuItem onSelect={() => onCopyDetailLink(record)}>
                复制详情链接
              </DropdownMenuItem>
            ) : null}
            {canCreateChat ? (
              <DropdownMenuItem onSelect={() => onLaunchChat(record)}>
                <IconMessage2 className="size-4" />
                发起 AI Chat
              </DropdownMenuItem>
            ) : null}
            {canPreviewFromMenu ? (
              <DropdownMenuItem onSelect={() => onPreviewResume(record)}>查看简历</DropdownMenuItem>
            ) : null}
            {canClose ? (
              <DropdownMenuItem onSelect={() => onTransition(record, "close")}>
                <IconCircleOff className="size-4" />
                标记结案
              </DropdownMenuItem>
            ) : null}
            {canReactivate ? (
              <DropdownMenuItem onSelect={() => onTransition(record, "reactivate")}>
                <IconArrowBackUp className="size-4" />
                重新激活
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDelete(record)} variant="destructive">
                  删除
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ResumeLibraryCard({
  canCreateChat,
  canCreateInterview,
  canDeleteResumeLibrary,
  canUpdateResumeLibrary,
  currentMemberRole,
  currentUserId,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchChat,
  onLaunchInterview,
  onOpenDetail,
  onPreviewResume,
  onSelectChange,
  onShowDuplicateMatches,
  onTransition,
  onViewJobDescription,
  record,
  selected,
}: ResumeLibraryCardProps) {
  const jobDescriptionLabel = getResumeLibraryJobDescriptionLabel(record);
  const lifecycle = describeLifecycleCell(record);
  const profileSnapshot = getResumeCardProfileSnapshot(record);
  const skills = getResumeCardSkills(record);
  const summary = getResumeCardSummary(record);
  const canCopyLink = canCopyResumeDetailLink({ currentMemberRole, currentUserId, record });

  return (
    <article
      className={cn(
        "rounded-2xl border bg-background p-4 shadow-xs transition-colors hover:border-border/80 hover:bg-muted/10",
        selected && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)_auto] xl:items-start">
        <div className="flex min-w-0 gap-3">
          <Checkbox
            aria-label={`选择 ${record.candidateName}`}
            checked={selected}
            className="mt-3"
            onCheckedChange={(value) => onSelectChange(Boolean(value))}
          />
          <div className="mt-0.5 size-12 shrink-0 overflow-hidden rounded-full">
            <Avvvatars radius={48} size={48} style="shape" value={getResumeAvatarValue(record)} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <button
                className="min-w-0 truncate text-left font-semibold text-base underline decoration-transparent underline-offset-4 transition-colors hover:decoration-foreground/40"
                onClick={() => onOpenDetail(record, "overview")}
                type="button"
              >
                {record.candidateName}
              </button>
              {duplicateMatchBadge(record, () => onShowDuplicateMatches(record))}
              <ResumeLifecycleBadge
                className="max-w-full"
                detailLabel={lifecycle.detailLabel}
                fullLabel={lifecycle.fullLabel}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(record, lifecycleTargetTab(record));
                }}
                stageLabel={lifecycle.stageLabel}
                tone={lifecycle.tone}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <ResumeCardMetaItem icon={<IconBriefcase className="size-3.5" />} label="关联岗位">
                <button
                  className={cn(
                    "min-w-0 truncate text-left underline decoration-foreground/15 underline-offset-4 hover:decoration-foreground/50",
                    !jobDescriptionLabel &&
                      "pointer-events-none text-muted-foreground no-underline",
                  )}
                  onClick={() => {
                    if (record.jobDescriptionId) {
                      onViewJobDescription(record.jobDescriptionId);
                    }
                  }}
                  type="button"
                >
                  关联岗位：{jobDescriptionLabel ?? "未绑定"}
                </button>
              </ResumeCardMetaItem>
              <ResumeCardMetaSeparator />
              <ResumeCardCreatorMeta image={record.creatorImage} name={record.creatorName} />
              <ResumeCardMetaSeparator />
              <span className="inline-flex h-6 items-center text-muted-foreground text-xs">
                <TimeDisplay as="span" emptyText="—" value={record.createdAt} />
              </span>
              <ResumeCardMetaSeparator />
              <ResumeCardMetaItem icon={<IconMail className="size-3.5" />} label="邮箱">
                {formatResumeCardContact(record.candidateEmail, "未填写邮箱")}
              </ResumeCardMetaItem>
              <ResumeCardMetaSeparator />
              <ResumeCardMetaItem icon={<IconPhone className="size-3.5" />} label="电话">
                {formatResumeCardContact(record.candidatePhone, "未填写电话")}
              </ResumeCardMetaItem>
            </div>

            {summary ? (
              <p className="mt-3 line-clamp-2 text-muted-foreground text-sm leading-6">{summary}</p>
            ) : null}

            {skills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {skills.map((item) => (
                  <Badge className="max-w-52 truncate" key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <ResumeCardProfileSnapshot snapshot={profileSnapshot} />

        <ResumeLibraryCardActions
          canCopyLink={canCopyLink}
          canCreateChat={canCreateChat}
          canCreateInterview={canCreateInterview}
          canDeleteResumeLibrary={canDeleteResumeLibrary}
          canUpdateResumeLibrary={canUpdateResumeLibrary}
          onCopyDetailLink={onCopyDetailLink}
          onDelete={onDelete}
          onEdit={onEdit}
          onLaunchChat={onLaunchChat}
          onLaunchInterview={onLaunchInterview}
          onOpenDetail={onOpenDetail}
          onPreviewResume={onPreviewResume}
          onTransition={onTransition}
          record={record}
        />
      </div>
    </article>
  );
}

interface ResumeLibraryCardListProps {
  canCreateChat: boolean;
  canCreateInterview: boolean;
  canDeleteResumeLibrary: boolean;
  canReadResumeUploadBatch: boolean;
  canUpdateResumeLibrary: boolean;
  canUploadResumeLibrary: boolean;
  currentMemberRole: string;
  currentUserId: string | null;
  empty: ReactNode;
  fetchNextPage: () => Promise<unknown>;
  filters: ToolbarFilterConfig[];
  grid: ResumeLibraryGridState;
  hasNextPage: boolean;
  onBulkDelete: () => void;
  onCopyDetailLink: (record: ResumeLibraryListRecord) => void;
  onDelete: (record: ResumeLibraryListRecord) => void;
  onEdit: (record: ResumeLibraryListRecord) => void;
  onLaunchChat: (record: ResumeLibraryListRecord) => void;
  onLaunchInterview: (record: ResumeLibraryListRecord) => void;
  onOpenBatchList: () => void;
  onOpenDetail: (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => void;
  onOpenUploadEntry: () => void;
  onPreviewResume: (record: ResumeLibraryListRecord) => void;
  onShowDuplicateMatches: (record: ResumeLibraryListRecord) => void;
  onTransition: (record: ResumeLibraryListRecord, mode: "close" | "reactivate") => void;
  onViewJobDescription: (id: string) => void;
  records: ResumeLibraryListRecord[];
  isFetchingNextPage: boolean;
  isInitialLoading: boolean;
  isRefetching: boolean;
  total: number;
  uploadEntryDisabled: boolean;
  hasActiveUploadBatches: boolean;
}

function ResumeLibraryCardList({
  canCreateChat,
  canCreateInterview,
  canDeleteResumeLibrary,
  canReadResumeUploadBatch,
  canUpdateResumeLibrary,
  canUploadResumeLibrary,
  currentMemberRole,
  currentUserId,
  empty,
  fetchNextPage,
  filters,
  grid,
  hasNextPage,
  hasActiveUploadBatches,
  isFetchingNextPage,
  isInitialLoading,
  isRefetching,
  onBulkDelete,
  onCopyDetailLink,
  onDelete,
  onEdit,
  onLaunchChat,
  onLaunchInterview,
  onOpenBatchList,
  onOpenDetail,
  onOpenUploadEntry,
  onPreviewResume,
  onShowDuplicateMatches,
  onTransition,
  onViewJobDescription,
  records,
  total,
  uploadEntryDisabled,
}: ResumeLibraryCardListProps) {
  const listRootRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const virtualizer = useVirtualizer({
    count: records.length,
    estimateSize: () => RESUME_LIBRARY_CARD_ESTIMATED_SIZE,
    getScrollElement: () => scrollElement,
    overscan: 6,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const selectedIds = useMemo(
    () => Object.keys(grid.bind.rowSelection).filter((id) => grid.bind.rowSelection[id]),
    [grid.bind.rowSelection],
  );
  const selectedRows = useMemo(
    () => records.filter((record) => grid.bind.rowSelection[record.id]),
    [records, grid.bind.rowSelection],
  );
  const hasLockedSelection = selectedRows.some(
    (record) => !canDeleteResumeRecord(record.resumeParseStatus),
  );
  const bulkSlot =
    canDeleteResumeLibrary && selectedIds.length > 0 ? (
      <Button
        className="flex-1 sm:flex-none"
        disabled={hasLockedSelection}
        onClick={onBulkDelete}
        title={hasLockedSelection ? "所选记录包含解析中的简历，暂不能删除" : undefined}
        variant="destructive"
      >
        <IconTrash className="size-4" />
        批量删除 ({selectedIds.length})
      </Button>
    ) : null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setScrollElement(findVerticalScrollParent(listRootRef.current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [records.length]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasNextPage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root: scrollElement, rootMargin: "720px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, scrollElement]);

  let loadMoreStatusText = "已显示全部简历";
  if (hasNextPage) {
    loadMoreStatusText = isFetchingNextPage
      ? "正在加载更多简历"
      : `已显示 ${records.length} / ${total} 条，继续下滑加载更多`;
  }

  let listContent: ReactNode = empty;
  if (isInitialLoading) {
    listContent = (
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-44 rounded-2xl" key={index} />
        ))}
      </div>
    );
  } else if (records.length > 0) {
    listContent = (
      <>
        <div className="relative transition-opacity" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((virtualRow) => {
            const record = records[virtualRow.index];
            if (!record) {
              return null;
            }
            return (
              <div
                className="absolute top-0 left-0 w-full pb-3 [contain:layout]"
                data-index={virtualRow.index}
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <ResumeLibraryCard
                  canCreateChat={canCreateChat}
                  canCreateInterview={canCreateInterview}
                  canDeleteResumeLibrary={canDeleteResumeLibrary}
                  canUpdateResumeLibrary={canUpdateResumeLibrary}
                  currentMemberRole={currentMemberRole}
                  currentUserId={currentUserId}
                  onCopyDetailLink={onCopyDetailLink}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onLaunchChat={onLaunchChat}
                  onLaunchInterview={onLaunchInterview}
                  onOpenDetail={onOpenDetail}
                  onPreviewResume={onPreviewResume}
                  onSelectChange={(checked) =>
                    grid.setRowSelection((prev) => ({ ...prev, [record.id]: checked }))
                  }
                  onShowDuplicateMatches={onShowDuplicateMatches}
                  onTransition={onTransition}
                  onViewJobDescription={onViewJobDescription}
                  record={record}
                  selected={Boolean(grid.bind.rowSelection[record.id])}
                />
              </div>
            );
          })}
        </div>
        <div
          className="flex min-h-10 items-center justify-center text-muted-foreground text-sm"
          ref={loadMoreRef}
        >
          {loadMoreStatusText}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4" ref={listRootRef}>
      <Toolbar
        bulkActionsSlot={bulkSlot}
        canResetFilters={grid.bind.canResetFilters}
        filterValues={grid.bind.filterValues}
        filters={filters}
        onFilterChange={grid.bind.onFilterChange}
        onRefresh={grid.bind.onRefresh}
        onResetFilters={grid.bind.onResetFilters}
        refreshing={isRefetching}
        searchLoading={isInitialLoading}
        toolbarRight={
          canUploadResumeLibrary || canReadResumeUploadBatch ? (
            <ButtonGroup>
              {canUploadResumeLibrary ? (
                <ResumeUploadEntryButton
                  disabled={uploadEntryDisabled}
                  onClick={onOpenUploadEntry}
                />
              ) : null}
              {canReadResumeUploadBatch && hasActiveUploadBatches ? (
                <Button onClick={onOpenBatchList} type="button">
                  <IconHistory className="size-4" />
                </Button>
              ) : null}
            </ButtonGroup>
          ) : null
        }
      />

      {listContent}
    </div>
  );
}

// 页面组件天然汇聚多种 dialog/state，复杂度阈值（20）会被踩到。
// 这是 UI 编排层，不是业务逻辑层；拆成更小组件会牺牲就近可读性。
// Page-level orchestrator naturally aggregates dialogs and state; splitting
// would harm local readability without reducing real complexity.
// oxlint-disable-next-line eslint/complexity
function ResumeLibraryPage({ metrics }: { metrics: ResumeLibraryMetrics }) {
  const slug = useWorkspaceSlug();
  const currentMemberRole = useWorkspaceMemberRole();
  const router = useRouter();
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes" });
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id ?? null;
  const canCreateInterview = useHasPermission("interview", "create");
  const canCreateChat = useHasPermission("chat", "create");
  const canCreateResumeLibrary = useHasPermission("resumeLibrary", "create");
  const canUpdateResumeLibrary = useHasPermission("resumeLibrary", "update");
  const canDeleteResumeLibrary = useHasPermission("resumeLibrary", "delete");
  const canReadResumeUploadBatch = useHasPermission("resumeUploadBatch", "read");
  const canCreateResumeUploadBatch = useHasPermission("resumeUploadBatch", "create");

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
    enabled: canReadResumeUploadBatch,
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
  const canUploadResumeLibrary = canCreateResumeLibrary && canCreateResumeUploadBatch;
  const uploadEntryDisabled = bulk.state.phase === "uploading" || !canUploadResumeLibrary;
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
    defaultPageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: EMPTY_FILTERS,
    queryFn: fetcher,
    queryKeyBase: ["studio-resumes", slug],
  });
  const [activeSort] = grid.sorting;
  let activeSortOrder: "asc" | "desc" | undefined;
  if (activeSort) {
    activeSortOrder = activeSort.desc ? "desc" : "asc";
  }
  const resumeLibraryListQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: PaginatedResumeLibraryResult) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetcher({
        filters: grid.filters,
        page: Number(pageParam),
        pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
        search: grid.deferredSearch,
        sortBy: activeSort?.id,
        sortOrder: activeSortOrder,
      }),
    queryKey: [
      "studio-resumes",
      slug,
      "infinite",
      {
        filters: grid.filters,
        search: grid.deferredSearch,
        sortBy: activeSort?.id,
        sortOrder: activeSortOrder,
      },
    ],
    staleTime: 30_000,
  });
  const loadedResumeRecords = useMemo(
    () => resumeLibraryListQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [resumeLibraryListQuery.data?.pages],
  );
  const resumeLibraryTotal = resumeLibraryListQuery.data?.pages[0]?.total ?? 0;
  const loadedResumeRowsById = useMemo(
    () => new Map(loadedResumeRecords.map((row) => [row.id, row])),
    [loadedResumeRecords],
  );

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
  const [duplicateMatchRecord, setDuplicateMatchRecord] = useState<ResumeLibraryListRecord | null>(
    null,
  );
  const [viewJobDescriptionId, setViewJobDescriptionId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const duplicateMatchesQuery = useQuery({
    enabled: duplicateMatchRecord !== null,
    queryFn: () => fetchStudioResumeDuplicateMatches(slug, duplicateMatchRecord?.id ?? ""),
    queryKey: ["studio-resumes", slug, duplicateMatchRecord?.id, "duplicate-matches"],
  });

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
    const selectedIds = Object.keys(grid.rowSelection).filter((id) => grid.rowSelection[id]);
    const locked = selectedIds.some((id) => {
      const row = loadedResumeRowsById.get(id);
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

  const resumeLibraryEmptyState = grid.filters.stage ? (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconUsers className="size-5" />
        </EmptyMedia>
        <EmptyTitle>
          暂无处于「
          {pipelineStageMeta[grid.filters.stage as PipelineStage]?.label ?? grid.filters.stage}
          」阶段的候选人
        </EmptyTitle>
        <EmptyDescription>切换到其他阶段或「全部」查看更多候选人。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconUsers className="size-5" />
        </EmptyMedia>
        <EmptyTitle>简历库还没有任何候选人</EmptyTitle>
        <EmptyDescription>点击右上角「上传简历」加入第一份候选人简历。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canUploadResumeLibrary ? (
          <ResumeUploadEntryButton
            disabled={uploadEntryDisabled}
            onClick={() => setUploadEntryOpen(true)}
          />
        ) : null}
      </EmptyContent>
    </Empty>
  );

  return (
    <>
      <div className="container mx-auto max-w-7xl space-y-6">
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
        <ResumeLibraryCardList
          canCreateChat={canCreateChat}
          canCreateInterview={canCreateInterview}
          canDeleteResumeLibrary={canDeleteResumeLibrary}
          canReadResumeUploadBatch={canReadResumeUploadBatch}
          canUpdateResumeLibrary={canUpdateResumeLibrary}
          canUploadResumeLibrary={canUploadResumeLibrary}
          currentMemberRole={currentMemberRole}
          currentUserId={currentUserId}
          empty={resumeLibraryEmptyState}
          fetchNextPage={resumeLibraryListQuery.fetchNextPage}
          filters={filtersConfig}
          grid={grid}
          hasActiveUploadBatches={hasActiveUploadBatches}
          hasNextPage={Boolean(resumeLibraryListQuery.hasNextPage)}
          isFetchingNextPage={resumeLibraryListQuery.isFetchingNextPage}
          isInitialLoading={resumeLibraryListQuery.isLoading}
          isRefetching={
            resumeLibraryListQuery.isRefetching && !resumeLibraryListQuery.isFetchingNextPage
          }
          onBulkDelete={() => setBulkDeleteOpen(true)}
          onCopyDetailLink={(record) => void copyResumeDetailLink(slug, record)}
          onDelete={setDeleteRecord}
          onEdit={(record) => setEditRecordId(record.id)}
          onLaunchChat={(record) =>
            openStudioResumeChat({
              candidateName: record.candidateName ?? null,
              recordId: record.id,
            })
          }
          onLaunchInterview={startAiInterview}
          onOpenBatchList={() => setBatchListOpen(true)}
          onOpenDetail={(record, tab = "overview") => {
            setDetailDefaultTab(tab);
            setDetailRecordId(record.id);
          }}
          onOpenUploadEntry={() => setUploadEntryOpen(true)}
          onPreviewResume={setPreviewRecord}
          onShowDuplicateMatches={setDuplicateMatchRecord}
          onTransition={(record, mode) =>
            setTransitionTarget({
              candidate: { candidateName: record.candidateName, id: record.id },
              mode,
            })
          }
          onViewJobDescription={setViewJobDescriptionId}
          records={loadedResumeRecords}
          total={resumeLibraryTotal}
          uploadEntryDisabled={uploadEntryDisabled}
        />
        {/* DataGrid table preserved while the resume library moves to a card list.
        <DataGrid<ResumeLibraryListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(r) => r.id}
          columnPinning={{ left: ["select", "candidateName"], right: ["actions"] }}
          filters={filtersConfig}
          toolbarRight={...}
          bulkActions={...}
          empty={resumeLibraryEmptyState}
        />
        */}
      </div>

      <StudioPersonDetailDialog
        defaultTab={detailDefaultTab}
        mode="resume"
        onEdit={
          canUpdateResumeLibrary
            ? (id) => {
                const row = loadedResumeRowsById.get(id);
                const reason = row ? getResumeActionLockedReason(row.resumeParseStatus) : null;
                if (reason) {
                  toast.error(reason);
                  return;
                }
                setDetailRecordId(null);
                setEditRecordId(id);
              }
            : undefined
        }
        onLaunchInterview={
          canCreateInterview
            ? ({ id, candidateName }) => {
                const row = loadedResumeRowsById.get(id);
                if (row && !canLaunchInterviewFromResume(row.resumeParseStatus)) {
                  toast.error("简历解析完成后才能发起 AI 面试");
                  return;
                }
                if (row && !row.jobDescriptionId) {
                  toast.error("请先绑定在招岗位后再发起 AI 面试");
                  return;
                }
                setDetailRecordId(null);
                setLaunchingRecord({ candidateName, id });
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            setDetailRecordId(null);
            setDetailDefaultTab("overview");
          }
        }}
        // Action bar 触发：复用现有 transitionTarget state + TransitionCandidateDialog。
        // 不关详情面板——dialog 用 Radix stacking 叠在上面。
        // Action bar reuses the existing TransitionCandidateDialog stacked over the detail panel.
        onRequestClose={
          canUpdateResumeLibrary
            ? ({ id, candidateName, initialOutcome }) =>
                setTransitionTarget({
                  candidate: { candidateName, id },
                  initialOutcome,
                  mode: "close",
                })
            : undefined
        }
        onRequestReactivate={
          canUpdateResumeLibrary
            ? (candidate) =>
                setTransitionTarget({
                  candidate,
                  mode: "reactivate",
                })
            : undefined
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
      <ResumeDuplicateMatchesDialog
        isError={duplicateMatchesQuery.isError}
        isLoading={duplicateMatchesQuery.isLoading}
        matches={duplicateMatchesQuery.data?.matches ?? []}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateMatchRecord(null);
          }
        }}
        open={duplicateMatchRecord !== null}
        title={
          duplicateMatchRecord
            ? `${formatResumeCandidateTitle(
                duplicateMatchRecord.candidateName,
                duplicateMatchRecord.id,
              )} 的疑似重复简历`
            : "疑似重复简历"
        }
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
                  url={`/api/w/${slug}/studio/resumes/${previewRecord.id}/resume`}
                />
              </Suspense>
            ) : null;
          })()
        : null}

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
      <StudioResumeFloatingChat />
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
      location: { pathname: string; search: SearchParamsRecord };
      params: { slug: string };
    };
    const query = parseResumeQuery(location.search);
    await requireStudioPageAccess({
      action: "resumes",
      pathname: `/w/${params.slug}/studio/resumes`,
      slug: params.slug,
    });
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
