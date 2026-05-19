"use client";

import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
  ResumeLibraryMetrics,
} from "@/lib/shared/studio-resumes";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { BotIcon, EyeIcon, PencilIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  textColumn,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { bulkDeleteStudioResumes, deleteStudioResume, fetchStudioResumes } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { StudioPersonDetailDialog } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-detail-dialog";
import { StudioPersonEditDialog } from "@/app/(auth)/w/[slug]/studio/_components/studio-person-edit-dialog";
import { CreateResumeRecordDialog } from "./upload-resume-dialog";
import type { CreateResumeRecordResult } from "./upload-resume-dialog";
import { LaunchInterviewDialog } from "./launch-interview-dialog";
import { ResumeLibraryCharts } from "./resume-library-charts";

const PdfPreviewDialog = dynamic(
  async () => {
    const mod = await import("@/components/pdf-preview-dialog");
    return mod.PdfPreviewDialog;
  },
  { ssr: false },
);

// 简历库不需要额外的下拉过滤器（只有 search）；类型用最小占位以满足 useDataGridState
// 的 `F extends Record<string, string>` 约束。
// The resume library has no extra dropdown filters (search only); the placeholder
// type keeps `useDataGridState`'s `F extends Record<string, string>` constraint
// happy without adding any UI controls.
type ResumeFilters = Record<string, string>;
const EMPTY_FILTERS: ResumeFilters = {};

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: ResumeFilters;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

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
          page: params.page,
          pageSize: params.pageSize,
          search: params.search || undefined,
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
        }),
    [slug],
  );

  const grid = useDataGridState<ResumeLibraryListRecord, ResumeFilters>({
    defaultSorting: [{ desc: true, id: "createdAt" }],
    fetcher,
    initialData,
    initialFilters: EMPTY_FILTERS,
    namespace: "studio-resumes",
  });

  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  // 中文：打开简历详情弹窗时默认聚焦的 tab；点「已发起」直接跳到「AI 面试轮次」。
  // English: Default tab when opening the resume detail dialog — clicking
  // 已发起 jumps straight to the "AI 面试轮次" view.
  const [detailDefaultTab, setDetailDefaultTab] = useState<"overview" | "rounds">("overview");
  // 「保存并发起面试」成功后打开的 AI 面试详情弹窗对应的 round id；为 null 则不展示。
  // Round id whose AI interview detail dialog should pop after a successful
  // save-and-start; null hides the dialog.
  const [interviewRoundDetailId, setInterviewRoundDetailId] = useState<string | null>(null);
  // 当前正在「发起 AI 面试」弹窗中处理的简历记录（最小投影：行菜单和详情
  // 弹窗都通过这里触发）；null 则不展示。
  // Minimal record handle driving the launch-interview dialog. Both the row
  // menu and the resume detail dialog feed into this state; null hides it.
  const [launchingRecord, setLaunchingRecord] = useState<{
    id: string;
    candidateName: string | null;
  } | null>(null);
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
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
        size: 200,
        title: "候选人",
      }),
      textColumn<ResumeLibraryListRecord>({
        cell: (r) => r.targetRole || "—",
        key: "targetRole",
        title: "目标岗位",
      }),
      customColumn<ResumeLibraryListRecord>({
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
      customColumn<ResumeLibraryListRecord>({
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
      customColumn<ResumeLibraryListRecord>({
        cell: (r) =>
          r.hasInterviewRounds ? (
            <button
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setDetailDefaultTab("rounds");
                setDetailRecordId(r.id);
              }}
              type="button"
            >
              <Badge className="cursor-pointer hover:bg-emerald-600/15" variant="success">
                已发起
              </Badge>
            </button>
          ) : (
            <Badge variant="outline">未发起</Badge>
          ),
        key: "hasInterviewRounds",
        title: "AI 面试",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => <CreatorCell image={r.creatorImage} name={r.creatorName} />,
        key: "creatorName",
        title: "创建人",
      }),
      textColumn<ResumeLibraryListRecord>({
        cell: (r) => r.creatorOrganizationName ?? "—",
        key: "creatorOrganizationName",
        title: "创建人组织",
      }),
      dateColumn<ResumeLibraryListRecord>({
        key: "createdAt",
        sortable: true,
        title: "创建时间",
      }),
      actionsColumn<ResumeLibraryListRecord>({
        inline: [
          {
            icon: EyeIcon,
            label: "查看详情",
            onClick: (r) => {
              setDetailDefaultTab("overview");
              setDetailRecordId(r.id);
            },
          },
          { icon: PencilIcon, label: "编辑", onClick: (r) => setEditRecordId(r.id) },
        ],
        menu: [
          {
            icon: BotIcon,
            label: "发起 AI 面试",
            onClick: startAiInterview,
            // 已存在任意 AI 面试轮次时隐藏，避免重复发起；用户应在「AI 面试」页面继续。
            // Hide once the candidate already has any AI interview round to
            // prevent duplicate starts; users should continue from the AI
            // interview page instead.
            show: (r) => !r.hasInterviewRounds,
          },
          {
            icon: Trash2Icon,
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
    ],
    [],
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
          description="集中管理所有候选人简历。在这里上传 PDF 不会自动生成面试题，需要时再发起 AI 面试。"
        />
        <ResumeLibraryCharts metrics={metrics} />
        <ActiveBatchBanner onCancel={handleCancelActiveBatch} onContinue={handleContinueBatch} />
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
            <Empty className="border-border/60">
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
        onViewRoundDetail={(roundId) => {
          setDetailRecordId(null);
          setDetailDefaultTab("overview");
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
        mode="interview"
        onOpenChange={(open) => !open && setInterviewRoundDetailId(null)}
        onUpdated={invalidateAll}
        open={interviewRoundDetailId !== null}
        recordId={interviewRoundDetailId}
      />

      <LaunchInterviewDialog
        candidateName={launchingRecord?.candidateName ?? null}
        onLaunched={(round) => {
          invalidateAll();
          setInterviewRoundDetailId(round.id);
        }}
        onOpenChange={(open) => !open && setLaunchingRecord(null)}
        open={launchingRecord !== null}
        recordId={launchingRecord?.id ?? null}
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
