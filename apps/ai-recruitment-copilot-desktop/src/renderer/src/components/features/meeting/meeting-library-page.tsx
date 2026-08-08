import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingLibraryView } from "./meeting-library-view";
import { useMeetingLibrary } from "./use-meeting-library";

export function MeetingLibraryPage() {
  const { meetingsQuery, workspace, workspaceQuery } = useMeetingLibrary();
  if (workspaceQuery.isPending || (workspace && meetingsQuery.isPending)) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-3 px-6 py-6 md:grid-cols-2">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }
  const error = workspaceQuery.error ?? meetingsQuery.error;
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "加载会议记录失败"}
        </p>
        <Button onClick={() => void meetingsQuery.refetch()} type="button" variant="outline">
          重试
        </Button>
      </div>
    );
  }
  if (!workspace) {
    return <p className="px-6 py-16 text-center text-muted-foreground text-sm">未加入工作区</p>;
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 pb-10 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium text-xl tracking-tight">会议记录</h1>
        <p className="text-muted-foreground text-sm">浏览和播放你有权访问的私有会议</p>
      </div>
      <MeetingLibraryView
        meetings={meetingsQuery.data ?? []}
        renderMeeting={(meeting, content) => (
          <Link
            className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            params={{ meetingId: meeting.id }}
            to="/meetings/$meetingId"
          >
            {content}
          </Link>
        )}
      />
    </div>
  );
}
