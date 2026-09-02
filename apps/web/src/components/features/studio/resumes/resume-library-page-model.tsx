import { useElementScrollRestoration, useNavigate } from "@tanstack/react-router";
import { parseDataGridSearchParams } from "@/components/features/data-grid/query-contract";
import {
  RESUME_LIBRARY_INFINITE_PAGE_SIZE,
  resumeLibrarySortIds,
} from "@app/shared/studio-resumes";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import { pipelineStageValues } from "@app/db-schema/studio-interviews";

import {
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
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";
import {
  getResumeLibraryCardHeight,
  RESUME_LIBRARY_SERVER_CARD_HEIGHT,
} from "./resume-library-card-layout";

export { getResumeLibraryCardHeight } from "./resume-library-card-layout";

export interface ResumeFilters extends Record<string, string> {
  createdAtRange: string;
  creatorIds: string;
  jdIds: string;
  skills: string;
  stage: string;
}

// 工具栏多选下拉在 state/URL 里以 CSV 字符串编码，符合 data-grid 工具栏约定。
// 「skills」= 候选人必须同时拥有所有选中的技能（AND）；
// 「jdIds」= 关联岗位为所选中任一（OR，因为一份简历只能绑一个岗位）。
// Multi-select toolbar filters are CSV-encoded per the data-grid convention.
// skills = candidate must have ALL selected skills (intersection / AND);
// jdIds = candidate's linked JD is one of the selection (OR — a resume can
//          link to only one JD, so AND would always be empty for >1).
export const EMPTY_FILTERS: ResumeFilters = {
  createdAtRange: "",
  creatorIds: "",
  jdIds: "",
  recommendationLevels: "",
  skills: "",
  stage: "",
  structuredMaxScore: "",
  structuredMinScore: "",
  textFilters: "",
};
export const RESUME_LIBRARY_FILTER_KEYS =
  // SAFETY: Object.keys returns own keys from the fixed ResumeFilters owner contract above.
  Object.keys(EMPTY_FILTERS) as (keyof ResumeFilters & string)[];
// Stage is URL/query state controlled by tabs, not a resettable toolbar condition.
const resumeLibraryToolbarFilterKeys = RESUME_LIBRARY_FILTER_KEYS.filter((key) => key !== "stage");
const resumeLibraryFilterKeySet = new Set<string>(resumeLibraryToolbarFilterKeys);

function isResumeLibraryFilterKey(key: string): key is keyof ResumeFilters & string {
  return resumeLibraryFilterKeySet.has(key);
}
export const RESUME_LIBRARY_DEFAULT_SORTING = [{ desc: true, id: "createdAt" }];
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
const getServerCardHeight = () => RESUME_LIBRARY_SERVER_CARD_HEIGHT;

export function useResumeLibraryCardHeight() {
  return useSyncExternalStore(subscribeToViewportWidth, getViewportCardHeight, getServerCardHeight);
}

export function useResumeLibraryInitialScrollOffset() {
  const studioScrollEntry = useElementScrollRestoration({
    id: STUDIO_MAIN_SCROLL_RESTORATION_ID,
  });

  return studioScrollEntry?.scrollY;
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export function firstSearchValue(value: SearchParamsRecord[string]): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue === undefined ? undefined : String(firstValue);
}

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

    const MutationObserverClass = globalThis.MutationObserver;
    if (MutationObserverClass) {
      observer = new MutationObserverClass(selectStudioViewport);
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

export { coerceSearchParams } from "@/lib/client/data-grid-search";
export type { SearchParamsRecord } from "@/lib/client/data-grid-search";

export interface UseResumeLibrarySearchStateOptions {
  onRefresh: () => void;
  search: SearchParamsRecord;
  slug: string;
}

export function parseResumeQuery(searchParams: SearchParamsRecord): ResumeLibraryQueryState {
  return parseDataGridSearchParams(
    { ...searchParams, search: undefined },
    {
      allowedSortIds: resumeLibrarySortIds,
      defaultPageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
      defaultSorting: RESUME_LIBRARY_DEFAULT_SORTING,
      initialFilters: EMPTY_FILTERS,
    },
  );
}

export function useResumeLibrarySearchState({
  onRefresh,
  search: routeSearch,
  slug,
}: UseResumeLibrarySearchStateOptions): ResumeLibraryGridState {
  const navigate = useNavigate({ from: "/w/$slug/studio/resumes" });
  const query = useMemo(() => parseResumeQuery(routeSearch), [routeSearch]);
  const deferredSearch = useDeferredValue(query.search);
  const [rowSelection, setRowSelection] = useState<ResumeLibraryRowSelection>({});

  const updateRouteSearch = useCallback(
    (updates: Record<string, number | string | undefined>) => {
      void navigate({
        params: { slug },
        replace: true,
        resetScroll: false,
        search: (prev: SearchParamsRecord) => {
          const next = coerceSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) {
              Reflect.deleteProperty(next, key);
            } else {
              next[key] = value;
            }
          }
          return next;
        },
        to: "/w/$slug/studio/resumes",
      });
    },
    [navigate, slug],
  );

  const updateRouteSearchAndResetPage = useCallback(
    (updates: Record<string, string | undefined>) => {
      setRowSelection({});
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
      if (isResumeLibraryFilterKey(key)) {
        setFilter(key, value);
      }
    },
    [setFilter, updateRouteSearchAndResetPage],
  );

  const filterValues = useMemo(
    () => ({
      ...Object.fromEntries(resumeLibraryToolbarFilterKeys.map((key) => [key, query.filters[key]])),
      search: query.search,
    }),
    [query.filters, query.search],
  );

  const canResetFilters =
    query.search.trim() !== "" ||
    resumeLibraryToolbarFilterKeys.some((key) => query.filters[key] !== EMPTY_FILTERS[key]);

  const onResetFilters = useCallback(() => {
    setRowSelection({});
    updateRouteSearch({
      page: 1,
      search: undefined,
      ...Object.fromEntries(
        resumeLibraryToolbarFilterKeys.map((key) => [key, EMPTY_FILTERS[key] || undefined]),
      ),
    });
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
