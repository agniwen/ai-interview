import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { canDeleteResumeRecord, canLaunchInterviewFromResume } from "@arc/shared/studio-resumes";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { bulkDeleteStudioResumes, deleteStudioResume } from "@/lib/client/api";
import { runAsyncAction } from "@/lib/client/async-control";
import type { ResumeDetailDefaultTab } from "@/components/features/studio/resumes/resume-library-card";
import { copyResumeDetailLink, firstSearchValue } from "./resume-library-page-model";
import type { ResumeLibraryGridState, SearchParamsRecord } from "./resume-library-page-model";

const resumeLibraryRouteApi = getRouteApi("/w/$slug/studio/resumes");
const resumeDetailRouteApi = getRouteApi("/w/$slug/studio/resumes/overlay/$recordId");

export function useResumeLibraryPageActions({
  grid,
  invalidateAll,
  loadedResumeRowsById,
  routeSearch,
  setBulkDeleteOpen,
  setConfirmOpen,
  setDeleteRecord,
  setEditRecordId,
  setIsBulkDeleting,
  setLaunchingRecord,
  setPendingFiles,
  setTransitionTarget,
  slug,
}: {
  grid: ResumeLibraryGridState;
  invalidateAll: () => void;
  loadedResumeRowsById: Map<string, ResumeLibraryListRecord>;
  routeSearch: SearchParamsRecord;
  setBulkDeleteOpen: (open: boolean) => void;
  setConfirmOpen: (open: boolean) => void;
  setDeleteRecord: (record: ResumeLibraryListRecord | null) => void;
  setEditRecordId: (id: string | null) => void;
  setIsBulkDeleting: (deleting: boolean) => void;
  setLaunchingRecord: (record: { id: string; candidateName: string | null } | null) => void;
  setPendingFiles: (files: File[] | ((prev: File[]) => File[])) => void;
  setTransitionTarget: (
    target: {
      candidate: { id: string; candidateName: string | null };
      mode: "close" | "reactivate";
      initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
    } | null,
  ) => void;
  slug: string;
}) {
  const navigate = resumeLibraryRouteApi.useNavigate();
  const navigateDetail = resumeDetailRouteApi.useNavigate();
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
    navigate({
      params: { slug },
      replace: true,
      search: nextSearch,
      to: "/w/$slug/studio/resumes",
    });
  }, [navigate, routeSearch, setEditRecordId, slug]);

  function handleSingleUploadFilePicked(file: File) {
    setPendingFiles([file]);
    setConfirmOpen(true);
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

  async function handleDelete(deleteRecord: ResumeLibraryListRecord | null) {
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
    await runAsyncAction({
      cleanup: () => setIsBulkDeleting(false),
      onError: (error) => toast.error(error instanceof Error ? error.message : "批量删除失败"),
      operation: async () => {
        const result = await bulkDeleteStudioResumes(slug, ids);
        toast.success(`已删除 ${result.deleted ?? ids.length} 条记录`);
        grid.setRowSelection({});
        setBulkDeleteOpen(false);
        invalidateAll();
      },
    });
  }

  function onToggleStructuredScoreSort(activeSortId: string | undefined) {
    const isActive = activeSortId === "structuredScore";
    navigate({
      params: { slug },
      replace: true,
      resetScroll: false,
      search: {
        ...routeSearch,
        sortBy: isActive ? undefined : "structuredScore",
        sortOrder: isActive ? undefined : "desc",
      },
      to: "/w/$slug/studio/resumes",
    });
  }

  function onOpenDetail(record: ResumeLibraryListRecord, tab: ResumeDetailDefaultTab = "overview") {
    navigateDetail({
      params: { recordId: record.id, slug },
      resetScroll: false,
      search: (previous) => {
        const nextSearch = { ...previous };
        if (tab === "overview") {
          delete nextSearch.tab;
        } else {
          nextSearch.tab = tab;
        }
        return nextSearch;
      },
      state: (previous) => ({ ...previous, fromRecruiterResumeList: true }),
      to: "/w/$slug/studio/resumes/overlay/$recordId",
    });
  }

  function onCopyDetailLink(record: ResumeLibraryListRecord) {
    void copyResumeDetailLink(slug, record);
  }

  function onTransition(record: ResumeLibraryListRecord, mode: "close" | "reactivate") {
    setTransitionTarget({
      candidate: { candidateName: record.candidateName, id: record.id },
      mode,
    });
  }

  return {
    handleBulkDelete,
    handleDelete,
    handleMultipleUploadFilesPicked,
    handleSingleUploadFilePicked,
    onCopyDetailLink,
    onOpenDetail,
    onToggleStructuredScoreSort,
    onTransition,
    startAiInterview,
  };
}
