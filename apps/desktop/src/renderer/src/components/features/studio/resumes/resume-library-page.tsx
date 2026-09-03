import { Button } from "@/components/ui/button";
import { DesktopScrollToTopButton } from "@/components/features/studio/desktop-scroll-to-top-button";
import { ResumeLibraryFiltersBar } from "./resume-library-filters";
import { ResumeLibraryList } from "./resume-library-list";
import { useResumeLibraryList } from "./use-resume-library-list";

export function ResumeLibraryPage({ isDetailOpen }: { isDetailOpen: boolean }) {
  const {
    canResetFilters,
    fetchNextPage,
    filters,
    hasActiveFilters,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isInitialLoading,
    isRefetching,
    jobDescriptions,
    listError,
    onFilterChange,
    onResetFilters,
    records,
    refetch,
    retry,
    search,
    skillSuggestions,
    total,
    workspace,
    workspaceError,
    workspaceMembers,
  } = useResumeLibraryList();

  if (workspaceError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {workspaceError instanceof Error ? workspaceError.message : "加载工作区失败"}
        </p>
        <Button
          onClick={() => {
            refetch();
          }}
          type="button"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  }

  if (!isInitialLoading && !workspace) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium text-sm">未加入工作区</p>
        <p className="mt-1 text-muted-foreground text-xs">
          请先在网页端加入或创建工作区，再回到 Meeting Buddy 查看招聘台
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-8 pb-10 sm:px-6">
      <div className="space-y-1">
        <h1 className="font-medium text-xl tracking-tight text-foreground">招聘台</h1>
        <p className="text-muted-foreground text-sm">点击候选人可发起会议转录</p>
      </div>

      <ResumeLibraryFiltersBar
        canResetFilters={canResetFilters}
        filters={filters}
        isListLoading={isInitialLoading}
        isRefetching={isRefetching}
        jobDescriptions={jobDescriptions}
        onFilterChange={onFilterChange}
        onRefresh={() => {
          void refetch();
        }}
        onResetFilters={onResetFilters}
        search={search}
        skillSuggestions={skillSuggestions}
        workspaceMembers={workspaceMembers}
      />

      <ResumeLibraryList
        emptyHint={
          hasActiveFilters
            ? "当前筛选条件下没有匹配的候选人，试试调整筛选条件"
            : "当前工作区还没有招聘台记录"
        }
        error={listError}
        fetchNextPage={fetchNextPage}
        hasNextPage={hasNextPage}
        isFetching={isFetching}
        isFetchingNextPage={isFetchingNextPage}
        isInitialLoading={isInitialLoading}
        onRetry={retry}
        records={records}
        total={total}
      />

      {isDetailOpen ? null : <DesktopScrollToTopButton />}
    </div>
  );
}
