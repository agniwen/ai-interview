import { Button } from "@/components/ui/button";
import { ResumeLibraryList } from "./resume-library-list";
import { useResumeLibraryList } from "./use-resume-library-list";

export function ResumeLibraryPage() {
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isInitialLoading,
    listError,
    records,
    refetch,
    total,
    workspace,
    workspaceError,
  } = useResumeLibraryList();

  if (workspaceError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {workspaceError instanceof Error ? workspaceError.message : "加载工作区失败"}
        </p>
        <Button onClick={() => void refetch()} type="button" variant="outline">
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
          请先在网页端加入或创建工作区，再回到桌面端查看招聘台
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 pb-10 sm:px-6">
      <div className="space-y-1">
        <h1 className="font-medium text-xl tracking-tight text-foreground">招聘台</h1>
        <p className="text-muted-foreground text-sm">点击候选人可发起会议转录</p>
      </div>

      <ResumeLibraryList
        error={listError}
        fetchNextPage={async () => {
          await fetchNextPage();
        }}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isInitialLoading={isInitialLoading}
        onRetry={() => {
          void refetch();
        }}
        records={records}
        total={total}
      />
    </div>
  );
}
