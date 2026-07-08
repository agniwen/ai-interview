import { IconHistory, IconUsers } from "@tabler/icons-react";
import {
  HydrationBoundary,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReactVirtualizer, VirtualItem } from "@tanstack/react-virtual";
import {
  ClientOnly,
  Outlet,
  createFileRoute,
  notFound,
  redirect,
  useElementScrollRestoration,
  useLoaderData,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { loadStudioResumesState } from "@/lib/start/studio/resumes.functions";
import type { StudioResumesState } from "@/lib/start/studio/resumes.functions";
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";
import { parseCsvParam } from "@arc/shared/csv";
import { canDeleteResumeRecord, canLaunchInterviewFromResume } from "@arc/shared/studio-resumes";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
  ResumeLibraryMetrics,
} from "@arc/shared/studio-resumes";
import { pipelineStageMeta, pipelineStageValues } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  Suspense,
  lazy,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
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
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import type { ToolbarFilterConfig } from "@/components/data-grid";
import { Toolbar } from "@/components/data-grid/parts/toolbar";
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
import {
  ResumeUploadEntryButton,
  ResumeUploadEntryDialog,
} from "@/components/features/studio/resumes/resume-upload-entry-dialog";
import { LaunchInterviewDialog } from "@/components/features/studio/resumes/launch-interview-dialog";
import { ResumeLibraryCard } from "@/components/features/studio/resumes/resume-library-card";
import type { ResumeDetailDefaultTab } from "@/components/features/studio/resumes/resume-library-card";
import { ResumeLibraryCharts } from "@/components/features/studio/resumes/resume-library-charts";
import { ResumeLibraryFloatingActionBar } from "@/components/features/studio/resumes/resume-library-floating-action-bar";
import { TransitionCandidateDialog } from "@/components/features/studio/resumes/transition-candidate-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getPreviewableResumeDocumentKind } from "@/components/features/resume/resume-document-preview-button";

const ResumeDocumentPreviewDialog = lazy(async () => {
  const mod = await import("@/components/features/resume/resume-document-preview-dialog");
  return { default: mod.ResumeDocumentPreviewDialog };
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
const RESUME_LIBRARY_FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof ResumeFilters & string)[];
const RESUME_LIBRARY_ALLOWED_SORT_IDS = ["createdAt", "candidateName", "updatedAt"] as const;
const RESUME_LIBRARY_DEFAULT_SORTING = [{ desc: true, id: "createdAt" }];
const RESUME_LIBRARY_INFINITE_PAGE_SIZE = 20;
const RESUME_LIBRARY_CARD_ESTIMATED_SIZE = 240;

interface ResumeLibraryScrollRestoreSnapshot {
  measurements: VirtualItem[];
  recordId: string;
  recordTopInScrollElement: number;
  scrollOffset: number;
  viewportWidth: number;
}

let resumeLibraryScrollRestoreSnapshot: ResumeLibraryScrollRestoreSnapshot | null = null;

function useResumeLibraryInitialScrollRestore(
  restoreSnapshotRef: RefObject<ResumeLibraryScrollRestoreSnapshot | null>,
) {
  const initialScrollElement =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(
          `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
        );
  const canUseInitialMeasurements =
    !!restoreSnapshotRef.current &&
    !!initialScrollElement &&
    restoreSnapshotRef.current.viewportWidth === initialScrollElement.clientWidth;
  const studioScrollEntry = useElementScrollRestoration({
    id: STUDIO_MAIN_SCROLL_RESTORATION_ID,
  });

  return {
    initialMeasurementsCache: canUseInitialMeasurements
      ? restoreSnapshotRef.current?.measurements
      : undefined,
    initialOffset: canUseInitialMeasurements
      ? restoreSnapshotRef.current?.scrollOffset
      : studioScrollEntry?.scrollY,
  };
}

function useResumeLibraryResizeScrollRestore({
  listRootRef,
  records,
  restoreSnapshotRef,
  scrollElement,
  virtualizer,
}: {
  listRootRef: RefObject<HTMLDivElement | null>;
  records: ResumeLibraryListRecord[];
  restoreSnapshotRef: RefObject<ResumeLibraryScrollRestoreSnapshot | null>;
  scrollElement: HTMLElement | null;
  virtualizer: ReactVirtualizer<HTMLElement, HTMLElement>;
}) {
  useEffect(() => {
    const snapshot = restoreSnapshotRef.current;
    if (!snapshot || !scrollElement || records.length === 0) {
      return;
    }
    const recordIndex = records.findIndex((record) => record.id === snapshot.recordId);
    if (recordIndex === -1) {
      resumeLibraryScrollRestoreSnapshot = null;
      restoreSnapshotRef.current = null;
      return;
    }
    if (scrollElement.clientWidth === snapshot.viewportWidth) {
      resumeLibraryScrollRestoreSnapshot = null;
      restoreSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    let remainingAttempts = 4;
    const clearSnapshot = () => {
      resumeLibraryScrollRestoreSnapshot = null;
      restoreSnapshotRef.current = null;
    };
    const alignToSnapshot = () => {
      if (cancelled) {
        return;
      }
      const rowElement = listRootRef.current?.querySelector<HTMLElement>(
        `[data-resume-record-id="${snapshot.recordId}"]`,
      );
      if (!rowElement && remainingAttempts > 0) {
        remainingAttempts -= 1;
        frame = window.requestAnimationFrame(alignToSnapshot);
        return;
      }
      if (rowElement) {
        const nextTop =
          rowElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top;
        const correction = nextTop - snapshot.recordTopInScrollElement;
        if (Math.abs(correction) > 1) {
          virtualizer.scrollToOffset(scrollElement.scrollTop + correction);
        }
      }
      clearSnapshot();
    };
    virtualizer.scrollToIndex(recordIndex, { align: "start" });
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(alignToSnapshot);
    });

    return () => {
      cancelled = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [listRootRef, records, restoreSnapshotRef, scrollElement, virtualizer]);
}

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

const VISIBLE_PIPELINE_STAGES = pipelineStageValues.filter(
  (s) => !HIDDEN_PIPELINE_STAGE_TABS.has(s),
);

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

function formatResumeLibraryJobDescriptionLabel(record: ResumeLibraryListRecord) {
  return record.jobDescriptionName
    ? [record.jobDescriptionDepartmentName, record.jobDescriptionName].filter(Boolean).join(" / ")
    : null;
}

interface FetchParams {
  page: number;
  pageSize: number;
  search: string;
  filters: ResumeFilters;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

type ResumeLibraryRowSelection = Record<string, boolean>;

interface ResumeLibraryQueryState {
  filters: ResumeFilters;
  page: number;
  pageSize: number;
  search: string;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

interface ResumeLibraryGridState {
  bind: {
    canResetFilters: boolean;
    filterValues: Record<string, string>;
    onFilterChange: (key: string, value: string) => void;
    onRefresh: () => void;
    onResetFilters: () => void;
    rowSelection: ResumeLibraryRowSelection;
  };
  deferredSearch: string;
  filters: ResumeFilters;
  rowSelection: ResumeLibraryRowSelection;
  setFilter: (key: keyof ResumeFilters & string, value: string) => void;
  setRowSelection: Dispatch<SetStateAction<ResumeLibraryRowSelection>>;
  sorting: { desc: boolean; id: string }[];
}

type SearchParamsPrimitive = boolean | number | string;
type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

interface UseResumeLibrarySearchStateOptions {
  onRefresh: () => void;
  search: SearchParamsRecord;
  slug: string;
}

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

function parseResumeQuery(searchParams: SearchParamsRecord): ResumeLibraryQueryState {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: RESUME_LIBRARY_ALLOWED_SORT_IDS,
    defaultPageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
    defaultSorting: RESUME_LIBRARY_DEFAULT_SORTING,
    initialFilters: EMPTY_FILTERS,
  });
}

function useResumeLibrarySearchState({
  onRefresh,
  search: routeSearch,
  slug,
}: UseResumeLibrarySearchStateOptions): ResumeLibraryGridState {
  const router = useRouter();
  const query = useMemo(() => parseResumeQuery(routeSearch), [routeSearch]);
  const deferredSearch = useDeferredValue(query.search);
  const [rowSelection, setRowSelection] = useState<ResumeLibraryRowSelection>({});

  const updateRouteSearch = useCallback(
    (updates: Record<string, number | string | undefined>) => {
      void router.navigate({
        params: { slug },
        replace: true,
        resetScroll: false,
        search: (prev: SearchParamsRecord) => {
          const next = Object.fromEntries(
            Object.entries(coerceSearchParams(prev)).filter(
              ([key]) => !(Object.hasOwn(updates, key) && updates[key] === undefined),
            ),
          ) as SearchParamsRecord;
          for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
              next[key] = value;
            }
          }
          return next;
        },
        to: "/w/$slug/studio/resumes",
      } as never);
    },
    [router, slug],
  );

  const updateRouteSearchAndResetPage = useCallback(
    (updates: Record<string, string | undefined>) => {
      updateRouteSearch({ ...updates, page: 1 });
    },
    [updateRouteSearch],
  );

  const setFilter = useCallback(
    (key: keyof ResumeFilters & string, value: string) => {
      updateRouteSearchAndResetPage({ [key]: value || undefined });
    },
    [updateRouteSearchAndResetPage],
  );

  const onFilterChange = useCallback(
    (key: string, value: string) => {
      if (key === "search") {
        updateRouteSearchAndResetPage({ search: value || undefined });
        return;
      }
      setFilter(key as keyof ResumeFilters & string, value);
    },
    [setFilter, updateRouteSearchAndResetPage],
  );

  const filterValues = useMemo(() => {
    const out: Record<string, string> = { search: query.search };
    for (const key of RESUME_LIBRARY_FILTER_KEYS) {
      out[key] = query.filters[key];
    }
    return out;
  }, [query.filters, query.search]);

  const canResetFilters =
    query.search.trim() !== "" ||
    RESUME_LIBRARY_FILTER_KEYS.some((key) => query.filters[key] !== EMPTY_FILTERS[key]);

  const onResetFilters = useCallback(() => {
    const updates: Record<string, number | string | undefined> = { page: 1, search: undefined };
    for (const key of RESUME_LIBRARY_FILTER_KEYS) {
      updates[key] = EMPTY_FILTERS[key] || undefined;
    }
    updateRouteSearch(updates);
  }, [updateRouteSearch]);

  const sorting = useMemo(
    () => (query.sortBy ? [{ desc: query.sortOrder === "desc", id: query.sortBy }] : []),
    [query.sortBy, query.sortOrder],
  );

  const bind = useMemo(
    () => ({
      canResetFilters,
      filterValues,
      onFilterChange,
      onRefresh,
      onResetFilters,
      rowSelection,
    }),
    [canResetFilters, filterValues, onFilterChange, onRefresh, onResetFilters, rowSelection],
  );

  return useMemo(
    () => ({
      bind,
      deferredSearch,
      filters: query.filters,
      rowSelection,
      setFilter,
      setRowSelection,
      sorting,
    }),
    [bind, deferredSearch, query.filters, rowSelection, setFilter, setRowSelection, sorting],
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
  const restoreSnapshotRef = useRef(resumeLibraryScrollRestoreSnapshot);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const initialScrollRestore = useResumeLibraryInitialScrollRestore(restoreSnapshotRef);
  const getVirtualItemKey = useCallback(
    (index: number) => records[index]?.id ?? `resume-placeholder-${index}`,
    [records],
  );
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>({
    count: records.length,
    estimateSize: () => RESUME_LIBRARY_CARD_ESTIMATED_SIZE,
    getItemKey: getVirtualItemKey,
    getScrollElement: () => scrollElement,
    initialMeasurementsCache: initialScrollRestore.initialMeasurementsCache,
    initialOffset: initialScrollRestore.initialOffset,
    overscan: 6,
    useAnimationFrameWithResizeObserver: true,
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
  const selectedItems = useMemo(
    () =>
      selectedRows.map((record) => ({
        id: record.id,
        jobDescriptionLabel: formatResumeLibraryJobDescriptionLabel(record),
        name: formatResumeCandidateTitle(record.candidateName, record.id),
      })),
    [selectedRows],
  );
  const hasLockedSelection = selectedRows.some(
    (record) => !canDeleteResumeRecord(record.resumeParseStatus),
  );
  const bulkDeleteLockedReason = hasLockedSelection
    ? "所选记录包含解析中的简历，暂不能删除"
    : undefined;
  const canShowFloatingActionBar = canDeleteResumeLibrary && selectedIds.length > 0;
  const handleOpenDetail = useCallback(
    (record: ResumeLibraryListRecord, tab?: ResumeDetailDefaultTab) => {
      const rowElement = listRootRef.current?.querySelector<HTMLElement>(
        `[data-resume-record-id="${record.id}"]`,
      );
      if (scrollElement && rowElement) {
        resumeLibraryScrollRestoreSnapshot = {
          measurements: virtualizer.takeSnapshot(),
          recordId: record.id,
          recordTopInScrollElement:
            rowElement.getBoundingClientRect().top - scrollElement.getBoundingClientRect().top,
          scrollOffset: scrollElement.scrollTop,
          viewportWidth: scrollElement.clientWidth,
        };
      }
      onOpenDetail(record, tab);
    },
    [onOpenDetail, scrollElement, virtualizer],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setScrollElement(
        document.querySelector<HTMLElement>(
          `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
        ) ?? findVerticalScrollParent(listRootRef.current),
      );
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

  useResumeLibraryResizeScrollRestore({
    listRootRef,
    records,
    restoreSnapshotRef,
    scrollElement,
    virtualizer,
  });

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
                data-resume-record-id={record.id}
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
                  onOpenDetail={handleOpenDetail}
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
      {canShowFloatingActionBar ? (
        <ResumeLibraryFloatingActionBar
          disabled={hasLockedSelection}
          disabledReason={bulkDeleteLockedReason}
          onClearSelection={() => grid.setRowSelection({})}
          onBulkDelete={onBulkDelete}
          onRemoveItem={(id) => grid.setRowSelection((prev) => ({ ...prev, [id]: false }))}
          onViewItem={(id) => {
            const record = records.find((item) => item.id === id);
            if (record) {
              handleOpenDetail(record);
            }
          }}
          selectedCount={selectedIds.length}
          selectedItems={selectedItems}
        />
      ) : null}
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
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (batch) => batch.status === "pending" || batch.status === "running",
      )
        ? 10_000
        : false,
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

  const activeUploadBatchIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nextActiveBatchIds = new Set(
      libraryBatches
        .filter((batch) => batch.status === "pending" || batch.status === "running")
        .map((batch) => batch.id),
    );
    const hadBatchFinish = [...activeUploadBatchIdsRef.current].some(
      (batchId) => !nextActiveBatchIds.has(batchId),
    );
    activeUploadBatchIdsRef.current = nextActiveBatchIds;
    if (hadBatchFinish) {
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

  const refreshResumeList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
  }, [queryClient, slug]);
  const grid = useResumeLibrarySearchState({
    onRefresh: refreshResumeList,
    search: routeSearch as SearchParamsRecord,
    slug,
  });
  const { setRowSelection } = grid;

  useEffect(() => {
    setRowSelection({});
  }, [slug, setRowSelection]);

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

  // 「保存并发起面试」成功后打开的 AI 面试详情弹窗对应的 round id；为 null 则不展示。
  // Round id whose AI interview detail dialog should pop after a successful
  // save-and-start; null hides the dialog.
  const [interviewRoundDetailId, setInterviewRoundDetailId] = useState<string | null>(null);
  const [interviewDetailDialogOpen, setInterviewDetailDialogOpen] = useState(false);
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
        <EmptyTitle>招聘台还没有任何候选人</EmptyTitle>
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
      <div className="mx-auto w-full max-w-[96em] space-y-6">
        <PageHeader
          title="招聘"
          description="沉淀候选人档案、简历 PDF、岗位匹配和流程进展，筛选到面试推进都能从这里接上。"
        />
        <ClientOnly fallback={<Skeleton className="h-48 w-full" />}>
          <ResumeLibraryCharts metrics={metrics} />
        </ClientOnly>
        <Tabs
          onValueChange={(value) => {
            setRowSelection({});
            grid.setFilter("stage", value === "all" ? "" : value);
          }}
          value={grid.filters.stage || "all"}
        >
          <TabsList className="grid w-full  grid-cols-2 h-auto items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-wrap">
            <TabsTrigger
              className=" w-full flex-col items-start gap-0.5 px-3  sm:w-auto sm:px-8 py-1.5 h-12!"
              value="all"
            >
              <span className="text-sm leading-tight">全部</span>
              <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                {PIPELINE_STAGE_TAB_DESCRIPTIONS.all}
              </span>
            </TabsTrigger>
            {VISIBLE_PIPELINE_STAGES.map((s) => (
              <TabsTrigger
                className=" w-full flex-col items-start gap-0.5 px-3 sm:w-auto sm:px-8 py-1.5 h-12!"
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
          onLaunchChat={(record) => {
            if (!canLaunchInterviewFromResume(record.resumeParseStatus)) {
              toast.error("简历解析完成后才能发起 AI Chat");
              return;
            }
            openStudioResumeChat({
              candidateName: record.candidateName ?? null,
              recordId: record.id,
            });
          }}
          onLaunchInterview={startAiInterview}
          onOpenBatchList={() => setBatchListOpen(true)}
          onOpenDetail={(record, tab = "overview") => {
            void router.navigate({
              params: { recordId: record.id, slug },
              resetScroll: true,
              search: {
                ...routeSearch,
                tab: tab === "overview" ? undefined : tab,
              },
              state: (prev: Record<string, unknown>) => ({
                ...prev,
                fromRecruiterResumeList: true,
              }),
              to: "/w/$slug/studio/resumes/$recordId",
            } as never);
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
        onOpenChange={setInterviewDetailDialogOpen}
        onOpenChangeComplete={(open) => {
          if (!open && !interviewDetailDialogOpen) {
            setInterviewRoundDetailId(null);
            setInterviewDetailDefaultTab("overview");
          }
        }}
        onUpdated={invalidateAll}
        open={interviewDetailDialogOpen}
        recordId={interviewRoundDetailId}
      />

      <LaunchInterviewDialog
        candidateName={launchingRecord?.candidateName ?? null}
        onLaunched={(round) => {
          invalidateAll();
          setInterviewDetailDefaultTab("overview");
          setInterviewRoundDetailId(round.id);
          setInterviewDetailDialogOpen(true);
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

function StudioResumesRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/resumes",
  }) as unknown as StudioResumesState;
  const { slug } = useParams({ from: "/w/$slug/studio/resumes" });
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  if (state.status !== "ready") {
    return null;
  }

  if (pathname !== `/w/${slug}/studio/resumes`) {
    return <Outlet />;
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
    meta: [{ title: "招聘" }],
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
