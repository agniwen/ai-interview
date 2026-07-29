import type { ReactVirtualizer, VirtualItem } from "@tanstack/react-virtual";
import { useElementScrollRestoration, useRouter } from "@tanstack/react-router";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import type { ResumeFilters } from "@/lib/start/studio/resumes.functions";
import {
  RESUME_LIBRARY_INFINITE_PAGE_SIZE,
  resumeLibrarySortIds,
} from "@arc/shared/studio-resumes";
import type { ResumeLibraryListRecord } from "@arc/shared/studio-resumes";
import { pipelineStageValues } from "@arc/db-schema/studio-interviews";

import {
  lazy,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "sonner";
import { STUDIO_MAIN_SCROLL_RESTORATION_ID } from "@/components/features/studio/studio-scroll-restoration";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";

export const ResumeDocumentPreviewDialog = lazy(async () => {
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
export const EMPTY_FILTERS: ResumeFilters = {
  creatorIds: "",
  jdIds: "",
  skills: "",
  stage: "",
  structuredMaxScore: "",
  structuredMinScore: "",
};
export const RESUME_LIBRARY_FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof ResumeFilters &
  string)[];
export const RESUME_LIBRARY_DEFAULT_SORTING = [{ desc: true, id: "createdAt" }];
const RESUME_LIBRARY_CARD_HEIGHTS = {
  base: 564,
  lg: 476,
  md: 504,
  sm: 476,
  xl: 290,
  xxl: 242,
} as const;

export function getResumeLibraryCardHeight(viewportWidth: number) {
  if (viewportWidth >= 1536) {
    return RESUME_LIBRARY_CARD_HEIGHTS.xxl;
  }
  if (viewportWidth >= 1280) {
    return RESUME_LIBRARY_CARD_HEIGHTS.xl;
  }
  if (viewportWidth >= 1024) {
    return RESUME_LIBRARY_CARD_HEIGHTS.lg;
  }
  if (viewportWidth >= 768) {
    return RESUME_LIBRARY_CARD_HEIGHTS.md;
  }
  if (viewportWidth >= 640) {
    return RESUME_LIBRARY_CARD_HEIGHTS.sm;
  }
  return RESUME_LIBRARY_CARD_HEIGHTS.base;
}

const RESUME_LIBRARY_CARD_MEDIA_QUERIES = [640, 768, 1024, 1280, 1536].map(
  (width) => `(min-width: ${width}px)`,
);

const subscribeToViewportWidth = (onStoreChange: () => void) => {
  const mediaQueries = RESUME_LIBRARY_CARD_MEDIA_QUERIES.map((query) => window.matchMedia(query));
  for (const mediaQuery of mediaQueries) {
    mediaQuery.addEventListener("change", onStoreChange);
  }
  return () => {
    for (const mediaQuery of mediaQueries) {
      mediaQuery.removeEventListener("change", onStoreChange);
    }
  };
};

const getViewportCardHeight = () => getResumeLibraryCardHeight(window.innerWidth);
const getServerCardHeight = () => RESUME_LIBRARY_CARD_HEIGHTS.lg;

export function useResumeLibraryCardHeight() {
  return useSyncExternalStore(subscribeToViewportWidth, getViewportCardHeight, getServerCardHeight);
}

export interface ResumeLibraryScrollRestoreSnapshot {
  measurements: VirtualItem[];
  recordId: string;
  recordTopInScrollElement: number;
  scrollOffset: number;
  viewportWidth: number;
}

export const resumeLibraryScrollRestoreSnapshot: {
  current: ResumeLibraryScrollRestoreSnapshot | null;
} = { current: null };

export function setResumeLibraryScrollRestoreSnapshot(
  snapshot: ResumeLibraryScrollRestoreSnapshot | null,
) {
  resumeLibraryScrollRestoreSnapshot.current = snapshot;
}

export function useResumeLibraryInitialScrollRestore(
  restoreSnapshot: ResumeLibraryScrollRestoreSnapshot | null,
) {
  const initialScrollElement =
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>(
          `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
        );
  const canUseInitialMeasurements =
    !!restoreSnapshot &&
    !!initialScrollElement &&
    restoreSnapshot.viewportWidth === initialScrollElement.clientWidth;
  const studioScrollEntry = useElementScrollRestoration({
    id: STUDIO_MAIN_SCROLL_RESTORATION_ID,
  });

  return {
    initialMeasurementsCache: canUseInitialMeasurements ? restoreSnapshot.measurements : undefined,
    initialOffset: canUseInitialMeasurements
      ? restoreSnapshot.scrollOffset
      : studioScrollEntry?.scrollY,
  };
}

export function useResumeLibraryResizeScrollRestore({
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
      resumeLibraryScrollRestoreSnapshot.current = null;
      restoreSnapshotRef.current = null;
      return;
    }
    if (scrollElement.clientWidth === snapshot.viewportWidth) {
      resumeLibraryScrollRestoreSnapshot.current = null;
      restoreSnapshotRef.current = null;
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    let remainingAttempts = 4;
    const clearSnapshot = () => {
      resumeLibraryScrollRestoreSnapshot.current = null;
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

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export function firstSearchValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

// pipelineStage tab 副标题文案——简短，避免 tab 撑得过宽，移动端会隐藏。
// Short helper text shown inside each pipelineStage tab; hidden on mobile so
// tabs stay compact in narrow viewports.
export const PIPELINE_STAGE_TAB_DESCRIPTIONS: Record<string, string> = {
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
export const HIDDEN_PIPELINE_STAGE_TABS = new Set<string>(["written_test"]);

export async function copyResumeDetailLink(slug: string, record: ResumeLibraryListRecord) {
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

export const VISIBLE_PIPELINE_STAGES = pipelineStageValues.filter(
  (s) => !HIDDEN_PIPELINE_STAGE_TABS.has(s),
);

export function findVerticalScrollParent(node: HTMLElement | null): HTMLElement | null {
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

export function useResumeLibraryScrollElement(listRootRef: RefObject<HTMLDivElement | null>) {
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;
    const selectStudioViewport = () => {
      const viewport = document.querySelector<HTMLElement>(
        `[data-scroll-restoration-id="${STUDIO_MAIN_SCROLL_RESTORATION_ID}"]`,
      );
      if (!viewport) {
        return false;
      }
      setScrollElement(viewport);
      observer?.disconnect();
      return true;
    };

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(selectStudioViewport);
      observer.observe(document.body, {
        attributeFilter: ["data-scroll-restoration-id"],
        attributes: true,
        subtree: true,
      });
    }

    const frame = window.requestAnimationFrame(() => {
      if (!selectStudioViewport()) {
        setScrollElement(findVerticalScrollParent(listRootRef.current));
      }
    });
    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [listRootRef]);

  return scrollElement;
}

export function formatResumeLibraryJobDescriptionLabel(record: ResumeLibraryListRecord) {
  return record.jobDescriptionName
    ? [record.jobDescriptionDepartmentName, record.jobDescriptionName].filter(Boolean).join(" / ")
    : null;
}

export interface FetchParams {
  knownTotal?: number;
  page: number;
  pageSize: number;
  search: string;
  filters: ResumeFilters;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

export type ResumeLibraryRowSelection = Record<string, boolean>;

export interface ResumeLibraryQueryState {
  filters: ResumeFilters;
  page: number;
  pageSize: number;
  search: string;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

export interface ResumeLibraryGridState {
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

export type SearchParamsPrimitive = boolean | number | string;
export type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

export interface UseResumeLibrarySearchStateOptions {
  onRefresh: () => void;
  search: SearchParamsRecord;
  slug: string;
}

export function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
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

export function parseResumeQuery(searchParams: SearchParamsRecord): ResumeLibraryQueryState {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: resumeLibrarySortIds,
    defaultPageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
    defaultSorting: RESUME_LIBRARY_DEFAULT_SORTING,
    initialFilters: EMPTY_FILTERS,
  });
}

export function useResumeLibrarySearchState({
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
