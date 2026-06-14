"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { resumePoolScopeMeta } from "@arc/shared/resume-pool";
import type {
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";
import {
  DatabaseIcon,
  FileTextIcon,
  HistoryIcon,
  LoaderCircleIcon,
  UploadIcon,
} from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  useDataGridState,
} from "@/components/data-grid";
import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
import { PageHeader } from "@/components/features/studio/page-header";
import { BulkUploadProgressDialog } from "@/components/features/studio/resumes/bulk-upload-progress-dialog";
import { ResumeUploadEntryDialog } from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { UploadBatchListDialog } from "@/components/features/studio/resumes/upload-batch-list-dialog";
import { useBulkUpload } from "@/components/features/studio/resumes/use-bulk-upload";
import { Badge } from "@/components/ui/badge";
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

function normalizeScope(value: unknown): ResumePoolScope {
  return value === "public" ? "public" : "private";
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
  const [previewRecord, setPreviewRecord] = useState<ResumePoolListRecord | null>(null);
  const [importTarget, setImportTarget] = useState<ResumePoolListRecord | null>(null);

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
    defaultPageSize: 20,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: EMPTY_POOL_FILTERS,
    queryFn: fetcher,
    queryKeyBase: ["resume-pool", slug, scope],
  });

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

  const emptyTitle = scope === "private" ? "暂无私有简历" : "简历广场暂无简历";
  const columns = useMemo(
    () => [
      customColumn<ResumePoolListRecord>({
        cell: (record) => {
          const pdfTitle = record.resumeFileName ?? "查看简历 PDF";
          return (
            <div className="flex min-w-0 items-start gap-2">
              {record.resumeStorageKey ? (
                <button
                  aria-label={pdfTitle}
                  className="group/pdf mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setPreviewRecord(record);
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
                  onClick={() => setPreviewRecord(record)}
                  type="button"
                >
                  {getCandidateTitle(record)}
                </button>
                {record.candidateEmail ? (
                  <a
                    className="block max-w-full cursor-default truncate text-muted-foreground text-xs underline decoration-muted-foreground/20 underline-offset-4 hover:decoration-muted-foreground/60"
                    href={`mailto:${record.candidateEmail}`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    {record.candidateEmail}
                  </a>
                ) : (
                  <p className="truncate text-muted-foreground text-xs">未填写邮箱</p>
                )}
              </div>
            </div>
          );
        },
        enableSorting: true,
        key: "candidateName",
        size: 260,
        title: "候选人",
      }),
      customColumn<ResumePoolListRecord>({
        cell: (record) => record.targetRole || "—",
        key: "targetRole",
        title: "目标岗位",
      }),
      customColumn<ResumePoolListRecord>({
        cell: (record) => resumeParseStatusBadge(record),
        key: "resumeParseStatus",
        title: "解析",
      }),
      customColumn<ResumePoolListRecord>({
        cell: (record) => sourceLabel(record),
        key: "source",
        title: "来源",
      }),
      customColumn<ResumePoolListRecord>({
        cell: (record) =>
          record.importedResumeRecordId ? (
            <Badge variant="success">已入库</Badge>
          ) : (
            <Badge variant="secondary">未入库</Badge>
          ),
        key: "imported",
        title: "入库状态",
      }),
      dateColumn<ResumePoolListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      actionsColumn<ResumePoolListRecord>({
        inline: [
          {
            label: "推送",
            onClick: (record) => publishMutation.mutate(record),
            show: () => scope === "private",
          },
          {
            disabled: (record) => record.importedResumeRecordId !== null,
            label: "入库",
            onClick: (record) => setImportTarget(record),
          },
        ],
      }),
    ],
    [publishMutation, scope],
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
            <TabsTrigger className="h-auto px-3 py-1.5 sm:px-8" value="private">
              {resumePoolScopeMeta.private.label}
            </TabsTrigger>
            <TabsTrigger className="h-auto px-3 py-1.5 sm:px-8" value="public">
              {resumePoolScopeMeta.public.label}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <DataGrid<ResumePoolListRecord>
          {...grid.bind}
          columns={columns}
          getRowId={(record) => record.id}
          columnPinning={{ left: ["candidateName"], right: ["actions"] }}
          filters={filtersConfig}
          toolbarRight={
            <ButtonGroup>
              <Button className="sm:w-auto" onClick={() => setUploadOpen(true)}>
                <UploadIcon className="size-4" />
                上传简历
              </Button>
              {hasActiveUploadBatches ? (
                <Button onClick={() => setBatchListOpen(true)} type="button">
                  <HistoryIcon className="size-4" />
                </Button>
              ) : null}
            </ButtonGroup>
          }
          empty={
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
          }
        />
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
