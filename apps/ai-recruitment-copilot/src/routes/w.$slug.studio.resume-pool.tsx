"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import type { ResumePoolScope, ResumeUploadBatchDedupPolicy } from "@arc/db-schema/schema";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { resumePoolScopeMeta } from "@arc/shared/resume-pool";
import type {
  ResumePoolDetail,
  ResumePoolImportDuplicateMatchRecord,
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";
import type { LucideIcon } from "@/components/icons/hugeicons";
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  DatabaseIcon,
  FileTextIcon,
  FolderGit2Icon,
  GraduationCapIcon,
  HistoryIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
} from "@/components/icons/hugeicons";
import type { ReactNode } from "react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";
import { toast } from "sonner";
import { useDataGridState } from "@/components/data-grid";
import { MemberCell } from "@/components/data-grid/cells/member-cell";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { TimeDisplay } from "@/components/features/display/time-display";
import {
  ResumeDocumentFileIcon,
  getResumeDocumentFileIconKind,
} from "@/components/features/resume/resume-document-file-icon";
import { ResumeDedupMatchList } from "@/components/features/resume/resume-dedup-overlay";
import { ResumeEducationDisplayLine } from "@/components/features/resume/resume-education-line";
import {
  getPreviewableResumeDocumentKind,
  isPreviewableResumeDocumentInput,
  UnsupportedResumeDocumentPreviewTooltip,
} from "@/components/features/resume/resume-document-preview-button";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { PageHeader } from "@/components/features/studio/page-header";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { ResumeUploadEntryDialog } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  deleteResumePoolItem,
  fetchResumePoolItem,
  fetchResumePoolItems,
  importResumePoolItem,
  isApiError,
  publishResumePoolItem,
} from "@/lib/client/api";
import type { DedupMatchRecord } from "@/lib/client/api";
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { authClient } from "@/lib/client/auth-client";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceId, useWorkspaceSlug } from "@/lib/client/workspace-context";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
});

interface ResumePoolSearch {
  scope?: ResumePoolScope;
}

type ResumePoolSourceFilter = "all" | "non_referral" | "referral";
type ResumePoolFilters = Record<"importStatus" | "parseStatus", string> & {
  sourceType: ResumePoolSourceFilter;
};

const EMPTY_POOL_FILTERS: ResumePoolFilters = {
  importStatus: "",
  parseStatus: "",
  sourceType: "all",
};
const RESUME_POOL_INITIAL_PAGE_SIZE = 20;
const RESUME_POOL_LOAD_STEP = 20;
// oxlint-disable-next-line sort-keys -- Breakpoints are easier to audit in ascending viewport order.
const RESUME_POOL_MASONRY_COLUMNS = {
  0: 1,
  1024: 2,
  1280: 3,
  1440: 4,
  1920: 6,
  2560: 7,
} as const;

function normalizeScope(value: unknown): ResumePoolScope {
  return value === "private" ? "private" : "public";
}

function getCandidateTitle(record: ResumePoolListRecord) {
  return record.candidateName?.trim() || "未命名候选人";
}

function formatCandidateWorkYears(workYears: number | null) {
  return workYears === null ? null : `${workYears}年`;
}

function getCandidateDisplayTitle(record: ResumePoolListRecord) {
  const candidateTitle = getCandidateTitle(record);
  const targetRole = record.targetRole?.trim();
  if (record.resumeParseStatus !== "ready" || !targetRole) {
    return candidateTitle;
  }
  const workYears = formatCandidateWorkYears(record.workYears);
  if (workYears) {
    return `${targetRole}-${workYears}-${candidateTitle}`;
  }
  return `${targetRole}-${candidateTitle}`;
}

function resumeParseStatusBadge(record: ResumePoolListRecord) {
  switch (record.resumeParseStatus) {
    case "ready": {
      return <Badge variant="success">已解析</Badge>;
    }
    case "failed": {
      return <Badge variant="destructive">解析失败</Badge>;
    }
    case "queued": {
      return <Badge variant="secondary">待解析</Badge>;
    }
    case "processing": {
      return <Badge variant="secondary">解析中</Badge>;
    }
    case "unparsed": {
      return <Badge variant="secondary">未解析</Badge>;
    }
    default: {
      return <Badge variant="secondary">{record.resumeParseStatus}</Badge>;
    }
  }
}

function getResumePoolImportActionState(record: ResumePoolListRecord) {
  if (record.importedResumeRecordId) {
    return {
      disabled: true,
      label: "已入库",
      loading: false,
    };
  }

  switch (record.resumeParseStatus) {
    case "ready": {
      return {
        disabled: false,
        label: "入库到简历库",
        loading: false,
      };
    }
    case "queued": {
      return {
        disabled: true,
        label: "排队中",
        loading: true,
      };
    }
    case "processing": {
      return {
        disabled: true,
        label: "解析中",
        loading: true,
      };
    }
    case "failed": {
      return {
        disabled: true,
        label: "解析失败",
        loading: false,
      };
    }
    case "unparsed": {
      return {
        disabled: true,
        label: "未解析",
        loading: false,
      };
    }
    default: {
      return {
        disabled: true,
        label: "未解析",
        loading: false,
      };
    }
  }
}

function matchesSearch(record: ResumePoolListRecord, rawSearch: string) {
  const search = rawSearch.trim().toLowerCase();
  if (!search) {
    return true;
  }
  return [
    record.candidateName,
    record.candidateEmail,
    record.candidatePhone,
    record.resumeFileName,
    record.targetRole,
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(search));
}

function sourceLabel(record: ResumePoolListRecord) {
  if (record.sourceChannel === "referral") {
    return "内推";
  }
  if (record.sourceChannel === "mail_ingest") {
    return "邮箱推送";
  }
  if (record.scope === "private") {
    return "—";
  }
  return record.sourcePoolItemId ? "私有简历推送" : "公共上传";
}

function uploaderOrganizationLabel(record: ResumePoolListRecord) {
  return record.uploaderOrganizationName?.trim() || "未知组织";
}

function uploaderUserLabel(record: ResumePoolListRecord) {
  return record.uploaderName?.trim() || record.uploaderEmail?.trim() || "未知上传人";
}

function sourceActorLabel(record: ResumePoolListRecord) {
  return record.sourceChannel === "referral" ? "内推人" : "上传人";
}

function canDeletePoolRecord(
  record: ResumePoolListRecord,
  {
    currentOrganizationId,
    currentUserId,
  }: {
    currentOrganizationId: string | null;
    currentUserId: string | null;
  },
) {
  return Boolean(
    currentOrganizationId &&
    currentUserId &&
    record.organizationId === currentOrganizationId &&
    record.createdBy === currentUserId,
  );
}

function deletePoolRecordLabel(record: ResumePoolListRecord | null) {
  return record?.scope === "public" ? "简历广场简历" : "私有简历";
}

function sessionUserId(session: { user?: { id?: string | null } } | null | undefined) {
  return session?.user?.id ?? null;
}

function pruneSelectedPrivateResumeIds(
  current: Set<string>,
  scope: ResumePoolScope,
  visibleRecordIds: string[],
) {
  if (current.size === 0) {
    return current;
  }
  if (scope !== "private") {
    return new Set<string>();
  }

  const visibleIds = new Set(visibleRecordIds);
  const next = new Set([...current].filter((id) => visibleIds.has(id)));
  return next.size === current.size ? current : next;
}

function updateSelectedPrivateResumeIds(current: Set<string>, id: string, selected: boolean) {
  const next = new Set(current);
  if (selected) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

function removeSelectedPrivateResumeId(current: Set<string>, id: string) {
  if (!current.has(id)) {
    return current;
  }
  const next = new Set(current);
  next.delete(id);
  return next;
}

function sortPoolRecords(
  records: ResumePoolListRecord[],
  sortBy: string | undefined,
  sortOrder: "asc" | "desc" | undefined,
) {
  const direction = sortOrder === "asc" ? 1 : -1;
  const sorted = [...records];
  sorted.sort((a, b) => {
    if (sortBy === "candidateName") {
      return direction * getCandidateTitle(a).localeCompare(getCandidateTitle(b), "zh-CN");
    }
    const key = sortBy === "updatedAt" ? "updatedAt" : "createdAt";
    return direction * (new Date(a[key]).getTime() - new Date(b[key]).getTime());
  });
  return sorted;
}

function filterPoolRecords(
  records: ResumePoolListRecord[],
  input: {
    filters: ResumePoolFilters;
    search: string;
    sortBy: string | undefined;
    sortOrder: "asc" | "desc" | undefined;
  },
) {
  const filtered = records.filter((record) => {
    if (!matchesSearch(record, input.search)) {
      return false;
    }
    if (input.filters.parseStatus && record.resumeParseStatus !== input.filters.parseStatus) {
      return false;
    }
    if (input.filters.sourceType === "referral" && record.sourceChannel !== "referral") {
      return false;
    }
    if (input.filters.sourceType === "non_referral" && record.sourceChannel === "referral") {
      return false;
    }
    if (input.filters.importStatus === "imported" && !record.importedResumeRecordId) {
      return false;
    }
    if (input.filters.importStatus === "not_imported" && record.importedResumeRecordId) {
      return false;
    }
    return true;
  });
  return sortPoolRecords(filtered, input.sortBy, input.sortOrder);
}

function useJobDescriptions(slug: string) {
  return useQuery({
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"].all.$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
      return payload.records;
    },
    queryKey: ["job-descriptions", "all", slug],
    staleTime: 60_000,
  });
}

function buildJdOptions(records: JobDescriptionListRecord[]) {
  return records.map((jd) => ({
    description: jd.departmentName ?? undefined,
    label: jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name,
    value: jd.id,
  }));
}

function toResumeDedupMatches(result: ResumePoolImportDuplicateResult | null): DedupMatchRecord[] {
  return (result?.matches ?? []).map((match: ResumePoolImportDuplicateMatchRecord) => ({
    candidateEmail: match.candidateEmail,
    candidateName: match.candidateName,
    candidatePhone: match.candidatePhone,
    conflictingSignals: match.conflictingSignals,
    createdAt: match.createdAt,
    id: match.id,
    jobDescriptionName: match.jobDescriptionName,
    level: match.level,
    score: match.score,
    semanticReasons: match.semanticReasons,
    similarity: match.similarity,
    status: match.status,
    targetRole: match.targetRole,
  }));
}

function SelectResumePoolScopeDialog({
  defaultScope,
  onOpenChange,
  onSelected,
  open,
}: {
  defaultScope: ResumePoolScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelected: (scope: ResumePoolScope) => void;
}) {
  const [scope, setScope] = useState<ResumePoolScope>(defaultScope);

  useEffect(() => {
    if (open) {
      setScope(defaultScope);
    }
  }, [defaultScope, open]);

  return (
    <Modal
      footer={
        <>
          <Button size="lg" onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button
            size="lg"
            onClick={() => {
              onOpenChange(false);
              onSelected(scope);
            }}
          >
            下一步
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="sm"
      title="选择归属范围"
    >
      <RadioGroup
        className="grid grid-cols-2 gap-2"
        onValueChange={(value) => setScope(normalizeScope(value))}
        value={scope}
      >
        {(["private", "public"] as const).map((item) => (
          <FieldLabel className="w-full rounded-md border p-3" key={item}>
            <RadioGroupItem value={item} />
            <span>{resumePoolScopeMeta[item].label}</span>
          </FieldLabel>
        ))}
      </RadioGroup>
    </Modal>
  );
}

function PrivateResumePoolUploadPolicyDialog({
  fileCount,
  onConfirmed,
  onOpenChange,
  open,
}: {
  fileCount: number;
  open: boolean;
  onConfirmed: (dedupPolicy: ResumeUploadBatchDedupPolicy) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [dedupPolicy, setDedupPolicy] = useState<ResumeUploadBatchDedupPolicy>("skip");

  useEffect(() => {
    if (open) {
      setDedupPolicy("skip");
    }
  }, [open]);

  return (
    <Modal
      description="仅私有简历上传支持查重策略；简历广场允许多份重复简历。"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button onClick={() => onConfirmed(dedupPolicy)}>开始上传 ({fileCount})</Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      size="sm"
      title="查重策略"
    >
      <RadioGroup
        onValueChange={(value) => setDedupPolicy(value as ResumeUploadBatchDedupPolicy)}
        value={dedupPolicy}
      >
        <FieldLabel className="w-full rounded-md border p-3">
          <RadioGroupItem value="skip" />
          <span>跳过疑似重复（不创建新记录）</span>
        </FieldLabel>
        <FieldLabel className="w-full rounded-md border p-3">
          <RadioGroupItem value="create" />
          <span>照样创建（允许重复）</span>
        </FieldLabel>
      </RadioGroup>
    </Modal>
  );
}

function ImportResumePoolDialog({
  item,
  onImported,
  onOpenChange,
}: {
  item: ResumePoolListRecord | null;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const slug = useWorkspaceSlug();
  const { data: jobDescriptions = [] } = useJobDescriptions(slug);
  const [mode, setMode] = useState<"none" | "bind">("none");
  const [jobDescriptionId, setJobDescriptionId] = useState("");
  const [duplicates, setDuplicates] = useState<ResumePoolImportDuplicateResult | null>(null);

  useEffect(() => {
    if (!item) {
      setMode("none");
      setJobDescriptionId("");
      setDuplicates(null);
      return;
    }
    const canUseSourceJd =
      item.scope === "private" &&
      item.jobDescriptionId &&
      jobDescriptions.some((jd) => jd.id === item.jobDescriptionId);
    setMode(canUseSourceJd ? "bind" : "none");
    setJobDescriptionId(canUseSourceJd ? (item.jobDescriptionId ?? "") : "");
    setDuplicates(null);
  }, [item, jobDescriptions]);

  const mutation = useMutation({
    mutationFn: async (dedupPolicy: "check" | "force") => {
      if (!item) {
        throw new Error("请选择要入库的简历");
      }
      return await importResumePoolItem(slug, item.id, {
        dedupPolicy,
        jobDescriptionId: mode === "bind" ? jobDescriptionId : null,
        jobDescriptionMode: mode,
      });
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) {
        const payload = error.payload as ResumePoolImportDuplicateResult | null;
        if (payload?.status === "duplicate_found") {
          setDuplicates(payload);
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : "入库失败");
    },
    onSuccess: (result) => {
      if (result.status === "duplicate_found") {
        setDuplicates(result);
        return;
      }
      toast.success("已入库到简历库");
      onImported();
      onOpenChange(false);
    },
  });

  const bindInvalid = mode === "bind" && !jobDescriptionId;
  const { isPending } = mutation;

  return (
    <>
      <Modal
        dismissible={!isPending}
        footer={
          <>
            <Button disabled={isPending} onClick={() => onOpenChange(false)} variant="outline">
              取消
            </Button>
            <Button disabled={isPending || bindInvalid} onClick={() => mutation.mutate("check")}>
              {isPending ? (
                <LoaderCircleIcon className="size-4 animate-spin" />
              ) : (
                <DatabaseIcon className="size-4" />
              )}
              确认入库
            </Button>
          </>
        }
        onOpenChange={(next) => {
          if (!next && isPending) {
            return;
          }
          onOpenChange(next);
        }}
        open={item !== null}
        size="md"
        title="入库到简历库"
        description={item ? getCandidateTitle(item) : undefined}
      >
        <div className="space-y-5">
          <Field>
            <FieldLabel>关联岗位</FieldLabel>
            <FieldContent>
              <RadioGroup
                className="grid grid-cols-2 gap-2"
                disabled={isPending}
                onValueChange={(value) => setMode(value === "bind" ? "bind" : "none")}
                value={mode}
              >
                <FieldLabel className="w-full rounded-md border p-3">
                  <RadioGroupItem value="none" />
                  <span>不绑定岗位</span>
                </FieldLabel>
                <FieldLabel className="w-full rounded-md border p-3">
                  <RadioGroupItem value="bind" />
                  <span>绑定岗位</span>
                </FieldLabel>
              </RadioGroup>
            </FieldContent>
          </Field>
          {mode === "bind" ? (
            <Field data-invalid={bindInvalid ? true : undefined}>
              <FieldLabel htmlFor="resume-pool-import-jd">在招岗位</FieldLabel>
              <FieldContent>
                <SearchableSelect
                  disabled={isPending}
                  id="resume-pool-import-jd"
                  invalid={bindInvalid}
                  onChange={(next) => setJobDescriptionId(next ?? "")}
                  options={buildJdOptions(jobDescriptions)}
                  placeholder="请选择在招岗位"
                  searchPlaceholder="搜索岗位..."
                  value={jobDescriptionId || null}
                />
              </FieldContent>
            </Field>
          ) : null}
        </div>
      </Modal>
      <AlertDialog onOpenChange={(open) => !open && setDuplicates(null)} open={duplicates !== null}>
        <AlertDialogContent className="sm:max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>简历库中可能已有相同候选人</AlertDialogTitle>
            <AlertDialogDescription>
              系统会基于工作经历、项目经历、技能和岗位画像的语义相似度判断风险。
              请根据判断依据确认是否为同一候选人。确认后会继续创建一条新的简历库记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ResumeDedupMatchList matches={toResumeDedupMatches(duplicates)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                setDuplicates(null);
                mutation.mutate("force");
              }}
            >
              仍然入库
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function notesPreview(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
}

function textOrDash(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

function DetailSummaryItem({ children, label }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 min-w-0 break-words font-medium text-sm leading-6">{children}</dd>
    </div>
  );
}

type ResumePoolDetailLike = ResumePoolDetail | ResumePoolListRecord;
type ResumePoolProfile = ResumePoolDetail["resumeProfile"];

function ResumePoolDetailSummaryPanel({
  detail,
  isError,
  isLoading,
  resumeProfile,
}: {
  detail: ResumePoolDetailLike;
  isError: boolean;
  isLoading: boolean;
  resumeProfile: ResumePoolProfile;
}) {
  const skills = resumeProfile?.skills.slice(0, 8) ?? detail.skillsNormalized.slice(0, 8);
  const strengths = resumeProfile?.personalStrengths.slice(0, 3) ?? [];
  const note = detail.notes?.trim();

  return (
    <section className="space-y-6 rounded-2xl bg-muted/20 ">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-sm">候选人摘要</h3>
            {resumeParseStatusBadge(detail)}
            {detail.importedResumeRecordId ? (
              <Badge variant="success">已入库</Badge>
            ) : (
              <Badge variant="secondary">未入库</Badge>
            )}
          </div>
          {isError ? (
            <p className="mt-2 text-destructive text-sm">完整简历详情加载失败。</p>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm leading-6">
              {note || "暂无简历评价。"}
            </p>
          )}
        </div>
        {isLoading ? (
          <span className="inline-flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            正在加载完整详情
          </span>
        ) : null}
      </div>

      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-3">
        <DetailSummaryItem label="目标岗位">{textOrDash(detail.targetRole)}</DetailSummaryItem>
        <DetailSummaryItem label="来源">{sourceLabel(detail)}</DetailSummaryItem>
        <DetailSummaryItem label="上传组织">{uploaderOrganizationLabel(detail)}</DetailSummaryItem>
        <DetailSummaryItem label={sourceActorLabel(detail)}>{uploaderUserLabel(detail)}</DetailSummaryItem>
        <DetailSummaryItem label="工作年限">
          {textOrDash(resumeProfile?.workYears ?? null)}
        </DetailSummaryItem>
        <DetailSummaryItem label="邮箱">
          {detail.candidateEmail ? (
            <a
              className="break-all underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
              href={`mailto:${detail.candidateEmail}`}
            >
              {detail.candidateEmail}
            </a>
          ) : (
            "—"
          )}
        </DetailSummaryItem>
        <DetailSummaryItem label="电话">{textOrDash(detail.candidatePhone)}</DetailSummaryItem>
        <DetailSummaryItem label="创建时间">
          <TimeDisplay as="span" value={detail.createdAt} />
        </DetailSummaryItem>
      </dl>

      {skills.length > 0 || strengths.length > 0 ? (
        <div className="grid gap-5 border-border/50 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
          {skills.length > 0 ? (
            <div>
              <p className="mb-2 text-muted-foreground text-xs">核心技能</p>
              <ul className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li
                    className="rounded-full bg-background px-2.5 py-1 text-xs shadow-xs ring-1 ring-border/50"
                    key={skill}
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {strengths.length > 0 ? (
            <div>
              <p className="mb-2 text-muted-foreground text-xs">主要亮点</p>
              <ul className="space-y-2 text-sm">
                {strengths.map((strength) => (
                  <li className="line-clamp-2 text-muted-foreground leading-6" key={strength}>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ResumePoolStructuredInfoPanel({
  detail,
  isLoading,
  resumeProfile,
}: {
  detail: ResumePoolDetailLike;
  isLoading: boolean;
  resumeProfile: ResumePoolProfile;
}) {
  return (
    <section className="space-y-4 border-t border-border/50 pt-6">
      <h3 className="font-medium text-sm">结构化信息</h3>
      {detail.resumeParseStatus === "failed" && detail.resumeParseError ? (
        <p className="mt-2 text-destructive text-sm">{detail.resumeParseError}</p>
      ) : null}
      <div>
        {isLoading ? (
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <LoaderCircleIcon className="size-4 animate-spin" />
            正在加载结构化简历
          </div>
        ) : (
          <ResumeProfileView profile={resumeProfile} />
        )}
      </div>
    </section>
  );
}

function ResumePoolHighlightRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md border-muted/60 border bg-muted/25 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words text-foreground leading-5">{value}</div>
    </div>
  );
}

function ResumePoolCardHighlights({ record }: { record: ResumePoolListRecord }) {
  const { profileHighlights } = record;
  const { educationItems } = profileHighlights;
  const educationFallbackLines =
    profileHighlights.educationLines.length > 0
      ? profileHighlights.educationLines
      : profileHighlights.schools;
  const educationValue =
    educationItems.length > 0 ? (
      <ul className="flex flex-col gap-1">
        {educationItems.map((item) => (
          <li key={`${item.level ?? "education"}-${item.school}-${item.major ?? ""}`}>
            <ResumeEducationDisplayLine item={item} />
          </li>
        ))}
      </ul>
    ) : (
      educationFallbackLines.join("\n")
    );
  const rows = [
    {
      icon: GraduationCapIcon,
      label: "教育经历",
      value: educationValue,
      visible: educationItems.length > 0 || educationFallbackLines.length > 0,
    },
    {
      icon: Building2Icon,
      label: "最近公司",
      value: profileHighlights.latestCompany ?? "",
      visible: Boolean(profileHighlights.latestCompany),
    },
    {
      icon: FolderGit2Icon,
      label: "最近项目",
      value: profileHighlights.latestProject ?? "",
      visible: Boolean(profileHighlights.latestProject),
    },
  ].filter((item) => item.visible);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-border/70 border-t pt-3 text-xs">
      {rows.map((row) => (
        <ResumePoolHighlightRow
          icon={row.icon}
          key={row.label}
          label={row.label}
          value={row.value}
        />
      ))}
    </div>
  );
}

function ResumePoolCardUploaderMeta({ record }: { record: ResumePoolListRecord }) {
  const actorLabel = sourceActorLabel(record);
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <Building2Icon className="size-3.5 shrink-0" />
        <span className="truncate">{uploaderOrganizationLabel(record)}</span>
      </div>
      <span className="shrink-0">{actorLabel}</span>
      <MemberCell
        avatarClassName="size-4"
        avatarFallbackClassName="text-[8px]"
        avatarSize="default"
        className="min-w-0 gap-1"
        email={record.uploaderEmail}
        emailClassName="hidden"
        image={record.uploaderImage}
        name={record.uploaderName}
        nameClassName="font-normal text-muted-foreground text-xs leading-none"
        placeholder="未知上传人"
      />
    </div>
  );
}

function ResumePoolDetailDialog({
  onOpenChange,
  record,
  slug,
}: {
  record: ResumePoolListRecord | null;
  slug: string;
  onOpenChange: (open: boolean) => void;
}) {
  const itemId = record?.id ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(itemId),
    queryFn: async () => {
      if (!itemId) {
        return null;
      }
      return await fetchResumePoolItem(slug, itemId);
    },
    queryKey: ["resume-pool", "detail", slug, itemId],
  });
  const detail: ResumePoolDetail | ResumePoolListRecord | null = detailQuery.data ?? record;
  const resumeProfile = detailQuery.data?.resumeProfile ?? null;

  return (
    <Modal
      description={record?.resumeFileName ?? undefined}
      onOpenChange={onOpenChange}
      open={record !== null}
      size="2xl"
      title={record ? getCandidateTitle(record) : "候选人详情"}
    >
      {detail ? (
        <div className="space-y-8">
          <ResumePoolDetailSummaryPanel
            detail={detail}
            isError={detailQuery.isError}
            isLoading={detailQuery.isLoading}
            resumeProfile={resumeProfile}
          />
          <ResumePoolStructuredInfoPanel
            detail={detail}
            isLoading={detailQuery.isLoading}
            resumeProfile={resumeProfile}
          />
        </div>
      ) : null}
    </Modal>
  );
}

function ResumePoolCard({
  canDelete,
  deleting,
  onDelete,
  onOpenDetail,
  onOpenPdf,
  onImport,
  onPublish,
  onSelectionChange,
  publishing,
  record,
  selected,
  selectionDisabled,
  scope,
}: {
  record: ResumePoolListRecord;
  scope: ResumePoolScope;
  canDelete: boolean;
  publishing: boolean;
  deleting: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onSelectionChange: (record: ResumePoolListRecord, selected: boolean) => void;
}) {
  const title = getCandidateDisplayTitle(record);
  const previewLabel = record.resumeFileName ?? "查看简历";
  const skills = record.masteredSkills;
  const note = notesPreview(record.notes);
  const documentKind = getResumeDocumentFileIconKind({ fileName: record.resumeFileName });
  const hasStoredResume = Boolean(record.resumeStorageKey);
  const previewable = isPreviewableResumeDocumentInput({ fileName: record.resumeFileName });
  const canPreview = hasStoredResume && previewable;
  const importActionState = getResumePoolImportActionState(record);
  let documentIcon = (
    <span
      aria-disabled="true"
      aria-label="暂无可预览简历"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
      title="暂无可预览简历"
    >
      <ResumeDocumentFileIcon className="size-8" kind={documentKind} />
    </span>
  );
  if (canPreview) {
    documentIcon = (
      <button
        aria-label={previewLabel}
        className="group/pdf inline-flex size-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpenPdf(record)}
        title={previewLabel}
        type="button"
      >
        <ResumeDocumentFileIcon
          className="size-8 transition-transform duration-200 group-hover/pdf:scale-105"
          kind={documentKind}
        />
      </button>
    );
  } else if (hasStoredResume) {
    documentIcon = (
      <UnsupportedResumeDocumentPreviewTooltip>
        <span
          aria-disabled="true"
          aria-label="该格式不支持预览"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
        >
          <ResumeDocumentFileIcon className="size-8" kind={documentKind} />
        </span>
      </UnsupportedResumeDocumentPreviewTooltip>
    );
  }

  return (
    <Card className="w-full gap-3 rounded-md py-3">
      <CardHeader className="flex flex-row items-center gap-2 px-3">
        {documentIcon}
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm leading-5">
            <button
              className="line-clamp-2 text-left underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
              onClick={() => onOpenDetail(record)}
              title="点击姓名查看详情"
              type="button"
            >
              {title}
            </button>
          </CardTitle>
        </div>
        {record.sourceChannel === "referral" ? <Badge variant="secondary">内推</Badge> : null}
        {scope === "private" && canDelete ? (
          <Checkbox
            aria-label={`选择 ${title}`}
            checked={selected}
            disabled={selectionDisabled}
            onCheckedChange={(checked) => onSelectionChange(record, checked === true)}
          />
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-3 text-xs">
        <div className="flex flex-col gap-1.5 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <BriefcaseBusinessIcon className="size-3.5 shrink-0" />
            <span className="truncate">{record.targetRole || "未填写目标岗位"}</span>
          </div>
          <ResumePoolCardUploaderMeta record={record} />
        </div>

        <ResumePoolCardHighlights record={record} />

        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {skills.map((skill) => (
              <Badge className="max-w-full truncate" key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </div>
        ) : null}

        {note ? <p className="line-clamp-3 text-muted-foreground leading-5">{note}</p> : null}
      </CardContent>
      <CardFooter className="flex items-center gap-2 px-3">
        <Button
          aria-label={importActionState.label}
          className="min-w-0 flex-1 justify-center"
          disabled={importActionState.disabled}
          onClick={() => onImport(record)}
          title={importActionState.label}
          variant="outline"
        >
          {importActionState.loading ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <DatabaseIcon className="size-4" />
          )}
          {importActionState.label}
        </Button>
        {scope === "private" ? (
          <Button
            aria-label="推送到简历广场"
            className="shrink-0"
            disabled={publishing}
            onClick={() => onPublish(record)}
            size="icon-sm"
            title="推送到简历广场"
            variant="outline"
          >
            <SendIcon className="size-4" />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            aria-label={scope === "private" ? "删除私有简历" : "删除简历"}
            className="shrink-0"
            disabled={deleting}
            onClick={() => onDelete(record)}
            size="icon-sm"
            title={scope === "private" ? "删除私有简历" : "删除简历"}
            variant="outline"
          >
            <Trash2Icon className="size-4" />
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function ResumePoolLoadingState() {
  return (
    <div className="flex min-h-56 items-center justify-center text-muted-foreground text-sm">
      <span className="inline-flex items-center gap-2">
        <LoaderCircleIcon className="size-4 animate-spin" />
        正在加载简历
      </span>
    </div>
  );
}

function ResumePoolEmptyState({
  canResetFilters,
  emptyTitle,
  onUpload,
}: {
  canResetFilters: boolean;
  emptyTitle: string;
  onUpload: () => void;
}) {
  return (
    <Empty className="border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{emptyTitle}</EmptyTitle>
        <EmptyDescription>
          {canResetFilters ? "调整搜索或筛选条件后重试。" : "点击右上角上传第一份简历。"}
        </EmptyDescription>
      </EmptyHeader>
      {canResetFilters ? null : (
        <EmptyContent>
          <Button onClick={onUpload}>
            <UploadIcon className="size-4" />
            上传简历
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

function ResumePoolListContent({
  canResetFilters,
  currentOrganizationId,
  currentUserId,
  deleting,
  emptyTitle,
  isInitialPoolLoading,
  isPoolBusy,
  onDelete,
  onImport,
  onOpenDetail,
  onOpenPdf,
  onPublish,
  onSelectionChange,
  onUpload,
  publishing,
  records,
  selectedPrivateResumeIds,
  selectionDisabled,
  scope,
  showEmptyState,
}: {
  records: ResumePoolListRecord[];
  scope: ResumePoolScope;
  currentOrganizationId: string | null;
  currentUserId: string | null;
  publishing: boolean;
  deleting: boolean;
  isInitialPoolLoading: boolean;
  isPoolBusy: boolean;
  showEmptyState: boolean;
  emptyTitle: string;
  canResetFilters: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
  onSelectionChange: (record: ResumePoolListRecord, selected: boolean) => void;
  onUpload: () => void;
  selectedPrivateResumeIds: ReadonlySet<string>;
  selectionDisabled: boolean;
}) {
  if (records.length > 0) {
    return (
      <div className={isPoolBusy ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <ResponsiveMasonry columnsCountBreakPoints={RESUME_POOL_MASONRY_COLUMNS}>
          <Masonry gutter="16px">
            {records.map((record) => {
              const canDelete = canDeletePoolRecord(record, {
                currentOrganizationId,
                currentUserId,
              });
              return (
                <ResumePoolCard
                  canDelete={canDelete}
                  deleting={deleting}
                  key={record.id}
                  onDelete={onDelete}
                  onImport={onImport}
                  onOpenDetail={onOpenDetail}
                  onOpenPdf={onOpenPdf}
                  onPublish={onPublish}
                  publishing={publishing}
                  record={record}
                  selected={selectedPrivateResumeIds.has(record.id)}
                  selectionDisabled={selectionDisabled}
                  scope={scope}
                  onSelectionChange={onSelectionChange}
                />
              );
            })}
          </Masonry>
        </ResponsiveMasonry>
      </div>
    );
  }

  if (isInitialPoolLoading) {
    return <ResumePoolLoadingState />;
  }

  if (showEmptyState) {
    return (
      <ResumePoolEmptyState
        canResetFilters={canResetFilters}
        emptyTitle={emptyTitle}
        onUpload={onUpload}
      />
    );
  }

  return null;
}

function ResumePoolToolbarActions({
  hasActiveUploadBatches,
  hasSelectedPrivateResumes,
  isBulkDeleting,
  isDeletingPoolRecords,
  onBulkDelete,
  onOpenBatchList,
  onUpload,
  selectedCount,
}: {
  hasActiveUploadBatches: boolean;
  hasSelectedPrivateResumes: boolean;
  isBulkDeleting: boolean;
  isDeletingPoolRecords: boolean;
  selectedCount: number;
  onBulkDelete: () => void;
  onOpenBatchList: () => void;
  onUpload: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ButtonGroup>
        <Button className="sm:w-auto" onClick={onUpload}>
          <UploadIcon className="size-4" />
          上传简历
        </Button>
        {hasActiveUploadBatches ? (
          <Button
            aria-label="查看上传记录"
            onClick={onOpenBatchList}
            title="查看上传记录"
            type="button"
          >
            <HistoryIcon className="size-4" />
          </Button>
        ) : null}
      </ButtonGroup>
      {hasSelectedPrivateResumes ? (
        <Button
          disabled={isDeletingPoolRecords}
          onClick={onBulkDelete}
          type="button"
          variant="destructive"
        >
          {isBulkDeleting ? (
            <LoaderCircleIcon className="size-4 animate-spin" />
          ) : (
            <Trash2Icon className="size-4" />
          )}
          {isBulkDeleting ? "删除中…" : `删除所选 ${selectedCount} 份`}
        </Button>
      ) : null}
    </div>
  );
}

function ResumePoolPage() {
  const slug = useWorkspaceSlug();
  const workspaceId = useWorkspaceId();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/w/$slug/studio/resume-pool" }) as ResumePoolSearch;
  const navigate = useNavigate({ from: "/w/$slug/studio/resume-pool" });
  const scope = normalizeScope(search.scope);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [uploadScope, setUploadScope] = useState<ResumePoolScope>(scope);
  const [privateUploadPolicyOpen, setPrivateUploadPolicyOpen] = useState(false);
  const [pendingPrivateUploadFiles, setPendingPrivateUploadFiles] = useState<File[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ResumePoolListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumePoolListRecord | null>(null);
  const [importTarget, setImportTarget] = useState<ResumePoolListRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumePoolListRecord | null>(null);
  const [selectedPrivateResumeIds, setSelectedPrivateResumeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const queryKeyPrefix = useMemo(() => ["resume-pool", slug] as const, [slug]);
  const fetcher = useMemo(
    () =>
      async (params: {
        filters: ResumePoolFilters;
        page: number;
        pageSize: number;
        search: string;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }) => {
        const result = await fetchResumePoolItems(slug, scope);
        const filtered = filterPoolRecords(result.records, params);
        const start = (params.page - 1) * params.pageSize;
        const records = filtered.slice(start, start + params.pageSize);
        return {
          records,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / params.pageSize)),
        };
      },
    [scope, slug],
  );
  const grid = useDataGridState<ResumePoolListRecord, ResumePoolFilters>({
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultPageSize: RESUME_POOL_INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: EMPTY_POOL_FILTERS,
    maxPageSize: Number.MAX_SAFE_INTEGER,
    queryFn: fetcher,
    queryKeyBase: ["resume-pool", slug, scope],
  });
  const visibleRecordCount = grid.bind.data.length;
  const totalRecordCount = grid.bind.total;
  const isPoolBusy = grid.bind.loading || grid.bind.refetching;
  const hasMoreRecords = visibleRecordCount < totalRecordCount;
  const isInitialPoolLoading = isPoolBusy && visibleRecordCount === 0;
  const showEmptyState = !isInitialPoolLoading && grid.bind.data.length === 0;
  const showPoolFooter = visibleRecordCount > 0;
  const currentUserId = sessionUserId(session);
  const currentOrganizationId = workspaceId;
  const selectedPrivateResumeIdsArray = useMemo(
    () => [...selectedPrivateResumeIds],
    [selectedPrivateResumeIds],
  );
  const visibleRecordIds = useMemo(
    () => grid.bind.data.map((record) => record.id),
    [grid.bind.data],
  );
  const hasSelectedPrivateResumes = scope === "private" && selectedPrivateResumeIdsArray.length > 0;
  const loadMoreRecords = useCallback(() => {
    if (!hasMoreRecords || isPoolBusy) {
      return;
    }
    const nextPageSize = Math.min(
      totalRecordCount,
      grid.bind.pagination.pageSize + RESUME_POOL_LOAD_STEP,
    );
    grid.bind.pagination.onPageSizeChange(nextPageSize);
  }, [grid.bind.pagination, hasMoreRecords, isPoolBusy, totalRecordCount]);

  const invalidatePool = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeyPrefix });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  };

  const bulk = useBulkUpload({
    onBatchQueued: () => {
      setProgressOpen(false);
      toast.success("已加入后台解析队列");
      void queryClient.invalidateQueries({ queryKey: ["bulk-resume-batches", slug] });
      invalidatePool();
    },
    onRecordsChanged: invalidatePool,
  });
  const batchListQuery = useQuery({
    queryFn: () => listBulkResumeBatches(slug),
    queryKey: ["bulk-resume-batches", slug],
    refetchInterval: 10_000,
  });
  const poolBatches = useMemo(
    () => (batchListQuery.data ?? []).filter((batch) => batch.target === "resume_pool"),
    [batchListQuery.data],
  );
  const hasActiveUploadBatches = poolBatches.some(
    (batch) => batch.status === "pending" || batch.status === "running",
  );

  useEffect(() => {
    if (hasActiveUploadBatches) {
      void queryClient.invalidateQueries({ queryKey: queryKeyPrefix });
    }
  }, [hasActiveUploadBatches, queryClient, queryKeyPrefix]);

  useEffect(() => {
    setSelectedPrivateResumeIds((current) =>
      pruneSelectedPrivateResumeIds(current, scope, visibleRecordIds),
    );
  }, [scope, visibleRecordIds]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreRecords) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRecords();
        }
      },
      { rootMargin: "360px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreRecords, loadMoreRecords]);

  function startQueuedUpload(
    files: File[],
    targetScope: ResumePoolScope,
    dedupPolicy: ResumeUploadBatchDedupPolicy,
  ) {
    if (files.length === 0) {
      return;
    }
    setUploadEntryOpen(false);
    setPrivateUploadPolicyOpen(false);
    setPendingPrivateUploadFiles([]);
    setProgressOpen(true);
    void bulk.start(files, {
      dedupPolicy,
      jdMode: "none",
      jobDescriptionId: null,
      resumePoolScope: targetScope,
      target: "resume_pool",
    });
  }

  function handleQueuedUploadFilesPicked(files: File[], targetScope: ResumePoolScope) {
    if (files.length === 0) {
      return;
    }
    if (targetScope === "private") {
      setUploadEntryOpen(false);
      setPendingPrivateUploadFiles(files);
      setPrivateUploadPolicyOpen(true);
      return;
    }
    startQueuedUpload(files, "public", "create");
  }

  async function handleOpenBatch(batch: (typeof poolBatches)[number]) {
    setProgressOpen(true);
    if (batch.status === "pending" || batch.status === "running") {
      await bulk.resume(batch.id);
      return;
    }
    await bulk.view(batch.id);
  }

  function handlePrivateResumeSelection(record: ResumePoolListRecord, selected: boolean) {
    setSelectedPrivateResumeIds((current) =>
      updateSelectedPrivateResumeIds(current, record.id, selected),
    );
  }

  const publishMutation = useMutation({
    mutationFn: (record: ResumePoolListRecord) => publishResumePoolItem(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "推送失败"),
    onSuccess: () => {
      toast.success("已推送到简历广场");
      invalidatePool();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (record: ResumePoolListRecord) => deleteResumePoolItem(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除失败"),
    onSuccess: (_data, record) => {
      toast.success(`${deletePoolRecordLabel(record)}已删除`);
      setSelectedPrivateResumeIds((current) => removeSelectedPrivateResumeId(current, record.id));
      setDeleteTarget(null);
      invalidatePool();
    },
  });
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => deleteResumePoolItem(slug, id)));
      return ids.length;
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "批量删除失败"),
    onSettled: invalidatePool,
    onSuccess: (deletedCount) => {
      toast.success(`已删除 ${deletedCount} 份私有简历`);
      setSelectedPrivateResumeIds(new Set());
    },
  });
  const isDeletingPoolRecords = deleteMutation.isPending || bulkDeleteMutation.isPending;

  const emptyTitle = scope === "private" ? "暂无私有简历" : "简历广场暂无简历";
  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索候选人、邮箱、电话、简历名或目标岗位",
        type: "search" as const,
      },
      {
        clearable: false,
        key: "sourceType" as const,
        options: [
          { label: "全部", value: "all" },
          { label: "内推", value: "referral" },
          { label: "非内推", value: "non_referral" },
        ],
        placeholder: "按类型筛选",
        searchPlaceholder: "搜索类型…",
        type: "select" as const,
      },
      {
        key: "parseStatus" as const,
        options: [
          { label: "待解析", value: "queued" },
          { label: "解析中", value: "processing" },
          { label: "已解析", value: "ready" },
          { label: "解析失败", value: "failed" },
          { label: "未解析", value: "unparsed" },
        ],
        placeholder: "按解析状态筛选",
        type: "select" as const,
      },
      {
        key: "importStatus" as const,
        options: [
          { label: "已入库", value: "imported" },
          { label: "未入库", value: "not_imported" },
        ],
        placeholder: "按入库状态筛选",
        type: "select" as const,
      },
    ],
    [],
  );
  let loadMoreStatusText = "暂无可加载简历";
  if (hasMoreRecords) {
    loadMoreStatusText = isPoolBusy
      ? "正在加载更多简历"
      : `已显示 ${visibleRecordCount} / ${totalRecordCount} 条，继续下滑加载更多`;
  } else if (totalRecordCount > 0) {
    loadMoreStatusText = "已显示全部简历";
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          className="max-w-3xl"
          title="简历广场"
          description="先沉淀简历，再决定是否推送共享或入库到简历库。"
        />
        <Tabs
          onValueChange={(value) => void navigate({ search: { scope: normalizeScope(value) } })}
          value={scope}
        >
          <TabsList className="grid h-auto w-full grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-wrap">
            <TabsTrigger className="h-auto px-3 py-1.5 sm:px-8" value="public">
              {resumePoolScopeMeta.public.label}
            </TabsTrigger>
            <TabsTrigger className="h-auto px-3 py-1.5 sm:px-8" value="private">
              {resumePoolScopeMeta.private.label}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-4">
          <Toolbar
            canResetFilters={grid.bind.canResetFilters}
            filterValues={grid.bind.filterValues}
            filters={filtersConfig}
            onFilterChange={grid.bind.onFilterChange}
            onRefresh={grid.bind.onRefresh}
            onResetFilters={grid.bind.onResetFilters}
            refreshing={grid.bind.refetching}
            searchLoading={grid.bind.loading}
            toolbarRight={
              <ResumePoolToolbarActions
                hasActiveUploadBatches={hasActiveUploadBatches}
                hasSelectedPrivateResumes={hasSelectedPrivateResumes}
                isBulkDeleting={bulkDeleteMutation.isPending}
                isDeletingPoolRecords={isDeletingPoolRecords}
                onBulkDelete={() => bulkDeleteMutation.mutate(selectedPrivateResumeIdsArray)}
                onOpenBatchList={() => setBatchListOpen(true)}
                onUpload={() => setUploadOpen(true)}
                selectedCount={selectedPrivateResumeIdsArray.length}
              />
            }
          />
          <ResumePoolListContent
            canResetFilters={grid.bind.canResetFilters}
            currentOrganizationId={currentOrganizationId}
            currentUserId={currentUserId}
            deleting={isDeletingPoolRecords}
            emptyTitle={emptyTitle}
            isInitialPoolLoading={isInitialPoolLoading}
            isPoolBusy={isPoolBusy}
            onDelete={setDeleteTarget}
            onImport={setImportTarget}
            onOpenDetail={setDetailRecord}
            onOpenPdf={setPreviewRecord}
            onPublish={publishMutation.mutate}
            onSelectionChange={handlePrivateResumeSelection}
            onUpload={() => setUploadOpen(true)}
            publishing={publishMutation.isPending}
            records={grid.bind.data}
            selectedPrivateResumeIds={selectedPrivateResumeIds}
            selectionDisabled={isDeletingPoolRecords}
            scope={scope}
            showEmptyState={showEmptyState}
          />
          {showPoolFooter ? (
            <div className="flex flex-col items-center gap-3 px-2 pt-5 pb-10 text-center text-muted-foreground text-sm">
              <div ref={loadMoreRef} className="min-h-5">
                {hasMoreRecords && isPoolBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircleIcon className="size-4 animate-spin" />
                    {loadMoreStatusText}
                  </span>
                ) : (
                  loadMoreStatusText
                )}
              </div>
              <Button
                className="w-full sm:w-auto"
                disabled={isPoolBusy}
                onClick={grid.bind.onRefresh}
                type="button"
                variant="outline"
              >
                <RefreshCwIcon className={`size-4 ${isPoolBusy ? "animate-spin" : ""}`} />
                刷新简历广场
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <SelectResumePoolScopeDialog
        defaultScope={scope}
        onSelected={(nextScope) => {
          setUploadScope(nextScope);
          setUploadEntryOpen(true);
        }}
        onOpenChange={setUploadOpen}
        open={uploadOpen}
      />
      <ResumeUploadEntryDialog
        description="选择 1 份或多份 PDF，都会进入后台解析队列。"
        fileUploadDescription="可选择 1 份或多份 PDF，上传后在后台异步解析。"
        fileUploadTitle="请选择要加入简历广场的简历文件"
        onMultipleFilesPicked={(files) => handleQueuedUploadFilesPicked(files, uploadScope)}
        onOpenChange={setUploadEntryOpen}
        onSingleFilePicked={(file) => handleQueuedUploadFilesPicked([file], uploadScope)}
        open={uploadEntryOpen}
        title="上传简历"
      />
      <PrivateResumePoolUploadPolicyDialog
        fileCount={pendingPrivateUploadFiles.length}
        onConfirmed={(dedupPolicy) =>
          startQueuedUpload(pendingPrivateUploadFiles, "private", dedupPolicy)
        }
        onOpenChange={(open) => {
          setPrivateUploadPolicyOpen(open);
          if (!open) {
            setPendingPrivateUploadFiles([]);
          }
        }}
        open={privateUploadPolicyOpen}
      />
      <UploadBatchListDialog
        batches={poolBatches}
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
          if (!open && bulk.state.phase !== "completed" && bulk.state.phase !== "cancelled") {
            bulk.abort();
          }
          setProgressOpen(open);
        }}
        onResume={async () => {
          if (bulk.state.detail) {
            await bulk.resume(bulk.state.detail.batch.id);
          }
        }}
        open={progressOpen}
        state={bulk.state}
      />
      <ImportResumePoolDialog
        item={importTarget}
        onImported={invalidatePool}
        onOpenChange={(open) => !open && setImportTarget(null)}
      />
      <ResumePoolDetailDialog
        onOpenChange={(open) => !open && setDetailRecord(null)}
        record={detailRecord}
        slug={slug}
      />
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={deleteTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这份{deletePoolRecordLabel(deleteTarget)}？</AlertDialogTitle>
            <AlertDialogDescription>
              这会永久删除 {deleteTarget ? getCandidateTitle(deleteTarget) : "该记录"}。
              已入库到简历库的记录不会删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget);
                }
              }}
              variant="destructive"
            >
              <Trash2Icon className="size-4" />
              {deleteMutation.isPending ? "删除中…" : "确认删除"}
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
                  url={`/api/w/${slug}/studio/resume-pool/${previewRecord.id}/resume`}
                />
              </Suspense>
            ) : null;
          })()
        : null}
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resume-pool")({
  component: ResumePoolPage,
  head: () => ({
    meta: [{ title: "简历广场" }],
  }),
  validateSearch: (search: Record<string, unknown>): ResumePoolSearch => ({
    scope: normalizeScope(search.scope),
  }),
});
