import { useMemo } from "react";
import { Toolbar } from "@/components/data-grid";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  RecruitingJobDescriptionOption,
  SkillSuggestion,
  WorkspaceMemberOption,
} from "@/lib/client/studio-resumes";
import { buildResumeLibraryFiltersConfig } from "./resume-library-filters-config";
import {
  EMPTY_RESUME_LIBRARY_FILTERS,
  PIPELINE_STAGE_TABS,
  RESUME_LIBRARY_FILTER_KEYS,
} from "./resume-library-filter-model";
import type { ResumeLibraryFilters } from "./resume-library-filter-model";

function isResumeLibraryFilterKey(key: string): key is keyof ResumeLibraryFilters {
  return RESUME_LIBRARY_FILTER_KEYS.some((filterKey) => filterKey === key);
}

export function ResumeLibraryFiltersBar({
  canResetFilters,
  filters,
  isListLoading,
  isRefetching,
  jobDescriptions,
  onFilterChange,
  onRefresh,
  onResetFilters,
  search,
  selectedStructuredJob,
  skillSuggestions,
  workspaceMembers,
}: {
  canResetFilters: boolean;
  filters: ResumeLibraryFilters;
  isListLoading: boolean;
  isRefetching: boolean;
  jobDescriptions: RecruitingJobDescriptionOption[];
  onFilterChange: (key: keyof ResumeLibraryFilters | "search", value: string) => void;
  onRefresh: () => void;
  onResetFilters: () => void;
  search: string;
  selectedStructuredJob: RecruitingJobDescriptionOption | undefined;
  skillSuggestions: SkillSuggestion[];
  workspaceMembers: WorkspaceMemberOption[];
}) {
  const filterConfigs = useMemo(
    () =>
      buildResumeLibraryFiltersConfig({
        jobDescriptions,
        selectedStructuredJob,
        skillSuggestions,
        workspaceMembers,
      }),
    [jobDescriptions, selectedStructuredJob, skillSuggestions, workspaceMembers],
  );

  const filterValues = useMemo(() => {
    const filterEntries = RESUME_LIBRARY_FILTER_KEYS.map(
      // Score filters may be cleared in effectiveFilters when no structured JD.
      (key) => [key, filters[key] ?? EMPTY_RESUME_LIBRARY_FILTERS[key]] as const,
    );
    return Object.fromEntries([["search", search], ...filterEntries]);
  }, [filters, search]);

  return (
    <div className="flex flex-col gap-3">
      <Tabs
        onValueChange={(value) => {
          onFilterChange("stage", value === "all" ? "" : value);
        }}
        value={filters.stage || "all"}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 items-stretch gap-1 data-[orientation=horizontal]:h-auto sm:inline-flex sm:w-fit sm:flex-nowrap">
          {PIPELINE_STAGE_TABS.map((tab) => (
            <TabsTrigger
              className="h-12! w-full flex-col items-start gap-0.5 px-3 py-1.5 sm:w-auto sm:px-8"
              key={tab.value}
              value={tab.value}
            >
              <span className="text-sm leading-tight">{tab.label}</span>
              <span className="hidden text-[11px] font-normal leading-tight text-muted-foreground sm:inline">
                {tab.description}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Toolbar
        canResetFilters={canResetFilters}
        filterValues={filterValues}
        filters={filterConfigs}
        onFilterChange={(key, value) => {
          if (key === "search" || isResumeLibraryFilterKey(key)) {
            onFilterChange(key, value);
          }
        }}
        onRefresh={onRefresh}
        onResetFilters={onResetFilters}
        refreshing={isRefetching}
        searchLoading={isListLoading}
      />
    </div>
  );
}
