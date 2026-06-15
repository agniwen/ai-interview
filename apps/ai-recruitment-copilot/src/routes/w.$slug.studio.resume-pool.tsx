"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { resumePoolScopeMeta } from "@arc/shared/resume-pool";
import type {
  ResumePoolDetail,
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";
import type { LucideIcon } from "lucide-react";
import {
  BriefcaseBusinessIcon,
  Building2Icon,
  DatabaseIcon,
  FileTextIcon,
  FolderGit2Icon,
  GraduationCapIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PhoneIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";
import { toast } from "sonner";
import { useDataGridState } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
import { TimeDisplay } from "@/components/features/display/time-display";
import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
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
import { listBulkResumeBatches } from "@/lib/client/api/endpoints/bulk-resume-upload";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

const PdfPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/pdf/pdf-preview-dialog");
  return { default: mod.PdfPreviewDialog };
});

interface ResumePoolSearch {
  scope?: ResumePoolScope;
}

type ResumePoolFilters = Record<"importStatus" | "parseStatus", string>;

const EMPTY_POOL_FILTERS: ResumePoolFilters = { importStatus: "", parseStatus: "" };
const RESUME_POOL_INITIAL_PAGE_SIZE = 20;
const RESUME_POOL_LOAD_STEP = 20;
// oxlint-disable-next-line sort-keys -- Breakpoints are easier to audit in ascending viewport order.
const RESUME_POOL_MASONRY_COLUMNS = {
  0: 1,
  1024: 2,
  1280: 3,
  1440: 4,
  1536: 5,
  1920: 6,
  2560: 7,
} as const;

function normalizeScope(value: unknown): ResumePoolScope {
  return value === "private" ? "private" : "public";
}

function getCandidateTitle(record: ResumePoolListRecord) {
  return record.candidateName?.trim() || "未命名候选人";
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
  if (record.scope === "private") {
    return "—";
  }
  return record.sourcePoolItemId ? "私有简历推送" : "公共上传";
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
          <Button onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>简历库中可能已有相同候选人</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>确认后会继续创建一条新的简历库记录。</p>
                <div className="space-y-2">
                  {duplicates?.matches.slice(0, 5).map((match) => (
                    <div className="rounded-md border bg-muted/40 p-3 text-sm" key={match.id}>
                      <div className="font-medium text-foreground">{match.candidateName}</div>
                      <div className="text-muted-foreground text-xs">
                        {[match.candidateEmail, match.candidatePhone, match.resumeFileName]
                          .filter(Boolean)
                          .join(" / ") || "无联系方式"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
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
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="mt-1 min-w-0 break-words font-medium text-sm">{children}</div>
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
    <div className="rounded-2xl border border-border bg-background p-5">
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

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DetailSummaryItem label="目标岗位">{textOrDash(detail.targetRole)}</DetailSummaryItem>
        <DetailSummaryItem label="来源">{sourceLabel(detail)}</DetailSummaryItem>
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
      </div>

      {skills.length > 0 || strengths.length > 0 ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
          {skills.length > 0 ? (
            <div>
              <p className="mb-2 text-muted-foreground text-xs">核心技能</p>
              <ul className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <li
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs"
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
              <ul className="space-y-1.5 text-sm">
                {strengths.map((strength) => (
                  <li className="line-clamp-2 text-muted-foreground leading-normal" key={strength}>
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
    <div className="rounded-2xl border border-border bg-background p-5">
      <h3 className="font-medium text-sm">结构化信息</h3>
      {detail.resumeParseStatus === "failed" && detail.resumeParseError ? (
        <p className="mt-2 text-destructive text-sm">{detail.resumeParseError}</p>
      ) : null}
      <div className="mt-4">
        {isLoading ? (
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <LoaderCircleIcon className="size-4 animate-spin" />
            正在加载结构化简历
          </div>
        ) : (
          <ResumeProfileView profile={resumeProfile} />
        )}
      </div>
    </div>
  );
}

function ResumePoolHighlightRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="truncate text-foreground">{value}</span>
    </div>
  );
}

function ResumePoolCardHighlights({ record }: { record: ResumePoolListRecord }) {
  const rows = [
    {
      icon: GraduationCapIcon,
      label: "毕业院校",
      value: record.profileHighlights.schools.join(" / "),
    },
    {
      icon: Building2Icon,
      label: "最近公司",
      value: record.profileHighlights.latestCompany ?? "",
    },
    {
      icon: FolderGit2Icon,
      label: "最近项目",
      value: record.profileHighlights.latestProject ?? "",
    },
  ].filter((item) => item.value.length > 0);

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
        <div className="space-y-5">
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
  deleting,
  onDelete,
  onOpenDetail,
  onOpenPdf,
  onImport,
  onPublish,
  publishing,
  record,
  scope,
}: {
  record: ResumePoolListRecord;
  scope: ResumePoolScope;
  publishing: boolean;
  deleting: boolean;
  onOpenDetail: (record: ResumePoolListRecord) => void;
  onOpenPdf: (record: ResumePoolListRecord) => void;
  onImport: (record: ResumePoolListRecord) => void;
  onPublish: (record: ResumePoolListRecord) => void;
  onDelete: (record: ResumePoolListRecord) => void;
}) {
  const title = getCandidateTitle(record);
  const previewLabel = record.resumeFileName ?? "查看简历 PDF";
  const skills = record.skillsNormalized.slice(0, 5);
  const note = notesPreview(record.notes);
  const canPreview = Boolean(record.resumeStorageKey);

  return (
    <Card className="w-full gap-3 rounded-md py-3">
      <CardHeader className="flex flex-row items-start gap-2 px-3">
        {canPreview ? (
          <button
            aria-label={previewLabel}
            className="group/pdf inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenPdf(record)}
            title={previewLabel}
            type="button"
          >
            <PdfFileIcon className="size-8 transition-transform duration-200 group-hover/pdf:scale-105" />
          </button>
        ) : (
          <span
            aria-disabled="true"
            aria-label="暂无简历 PDF"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md opacity-45 grayscale"
            title="暂无简历 PDF"
          >
            <PdfFileIcon className="size-8" />
          </span>
        )}
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
          {record.candidateEmail ? (
            <a
              className="mt-1 block truncate text-muted-foreground text-xs underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
              href={`mailto:${record.candidateEmail}`}
            >
              {record.candidateEmail}
            </a>
          ) : (
            <p className="mt-1 truncate text-muted-foreground text-xs">未填写邮箱</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          {resumeParseStatusBadge(record)}
          {record.importedResumeRecordId ? (
            <Badge variant="success">已入库</Badge>
          ) : (
            <Badge variant="secondary">未入库</Badge>
          )}
        </div>

        <div className="flex flex-col gap-1.5 text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <BriefcaseBusinessIcon className="size-3.5 shrink-0" />
            <span className="truncate">{record.targetRole || "未填写目标岗位"}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <PhoneIcon className="size-3.5 shrink-0" />
            <span className="truncate">{record.candidatePhone || "未填写电话"}</span>
          </div>
        </div>

        <ResumePoolCardHighlights record={record} />

        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-muted-foreground">
          <span>来源</span>
          <span className="truncate text-foreground">{sourceLabel(record)}</span>
          <span>创建</span>
          <TimeDisplay as="span" className="text-foreground" value={record.createdAt} />
        </div>

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
      <CardFooter className="flex-col items-stretch gap-2 px-3">
        <Button
          aria-label={record.importedResumeRecordId ? "已入库" : "入库到简历库"}
          className="w-full justify-center"
          disabled={record.importedResumeRecordId !== null}
          onClick={() => onImport(record)}
          title={record.importedResumeRecordId ? "已入库" : "入库到简历库"}
          variant="outline"
        >
          <DatabaseIcon className="size-4" />
          {record.importedResumeRecordId ? "已入库" : "入库到简历库"}
        </Button>
        {scope === "private" ? (
          <div className="flex justify-end gap-1">
            <Button
              aria-label="推送到简历广场"
              className="size-8"
              disabled={publishing}
              onClick={() => onPublish(record)}
              size="icon"
              title="推送到简历广场"
              variant="outline"
            >
              <SendIcon className="size-4" />
            </Button>
            <Button
              aria-label="删除私有简历"
              className="size-8"
              disabled={deleting}
              onClick={() => onDelete(record)}
              size="icon"
              title="删除私有简历"
              variant="outline"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function ResumePoolPage() {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/w/$slug/studio/resume-pool" }) as ResumePoolSearch;
  const navigate = useNavigate({ from: "/w/$slug/studio/resume-pool" });
  const scope = normalizeScope(search.scope);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEntryOpen, setUploadEntryOpen] = useState(false);
  const [uploadScope, setUploadScope] = useState<ResumePoolScope>(scope);
  const [progressOpen, setProgressOpen] = useState(false);
  const [batchListOpen, setBatchListOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ResumePoolListRecord | null>(null);
  const [previewRecord, setPreviewRecord] = useState<ResumePoolListRecord | null>(null);
  const [importTarget, setImportTarget] = useState<ResumePoolListRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResumePoolListRecord | null>(null);
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

  function startQueuedUpload(files: File[], targetScope: ResumePoolScope) {
    if (files.length === 0) {
      return;
    }
    setUploadEntryOpen(false);
    setProgressOpen(true);
    void bulk.start(files, {
      dedupPolicy: "create",
      jdMode: "none",
      jobDescriptionId: null,
      resumePoolScope: targetScope,
      target: "resume_pool",
    });
  }

  async function handleOpenBatch(batch: (typeof poolBatches)[number]) {
    setProgressOpen(true);
    if (batch.status === "pending" || batch.status === "running") {
      await bulk.resume(batch.id);
      return;
    }
    await bulk.view(batch.id);
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
    onSuccess: () => {
      toast.success("私有简历已删除");
      setDeleteTarget(null);
      invalidatePool();
    },
  });

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
              <ButtonGroup>
                <Button className="sm:w-auto" onClick={() => setUploadOpen(true)}>
                  <UploadIcon className="size-4" />
                  上传简历
                </Button>
                {hasActiveUploadBatches ? (
                  <Button
                    aria-label="查看上传记录"
                    onClick={() => setBatchListOpen(true)}
                    title="查看上传记录"
                    type="button"
                  >
                    <HistoryIcon className="size-4" />
                  </Button>
                ) : null}
              </ButtonGroup>
            }
          />
          {grid.bind.data.length > 0 ? (
            <ResponsiveMasonry columnsCountBreakPoints={RESUME_POOL_MASONRY_COLUMNS}>
              <Masonry gutter="16px">
                {grid.bind.data.map((record) => (
                  <ResumePoolCard
                    deleting={deleteMutation.isPending}
                    key={record.id}
                    onDelete={setDeleteTarget}
                    onImport={setImportTarget}
                    onOpenDetail={setDetailRecord}
                    onOpenPdf={setPreviewRecord}
                    onPublish={publishMutation.mutate}
                    publishing={publishMutation.isPending}
                    record={record}
                    scope={scope}
                  />
                ))}
              </Masonry>
            </ResponsiveMasonry>
          ) : (
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>
                  {grid.bind.canResetFilters
                    ? "调整搜索或筛选条件后重试。"
                    : "点击右上角上传第一份简历。"}
                </EmptyDescription>
              </EmptyHeader>
              {grid.bind.canResetFilters ? null : (
                <EmptyContent>
                  <Button onClick={() => setUploadOpen(true)}>
                    <UploadIcon className="size-4" />
                    上传简历
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
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
        fileUploadTitle="请选择要加入简历广场的 PDF 简历"
        onMultipleFilesPicked={(files) => startQueuedUpload(files, uploadScope)}
        onOpenChange={setUploadEntryOpen}
        onSingleFilePicked={(file) => startQueuedUpload([file], uploadScope)}
        open={uploadEntryOpen}
        title="上传简历"
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
            <AlertDialogTitle>确认删除这份私有简历？</AlertDialogTitle>
            <AlertDialogDescription>
              这会从私有简历中永久删除 {deleteTarget ? getCandidateTitle(deleteTarget) : "该记录"}。
              已入库到简历库的记录不会删除，已推送到简历广场的公共记录也不会删除。
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
      {previewRecord ? (
        <Suspense fallback={null}>
          <PdfPreviewDialog
            filename={previewRecord.resumeFileName ?? undefined}
            onOpenChange={(open) => !open && setPreviewRecord(null)}
            open={previewRecord !== null}
            url={`/api/w/${slug}/studio/resume-pool/${previewRecord.id}/resume`}
          />
        </Suspense>
      ) : null}
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
