import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingLibraryView } from "./meeting-library-view";
import { useMeetingLibrary } from "./use-meeting-library";

export function MeetingLibraryPage() {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchText(searchText), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  const normalizedSearchText = debouncedSearchText.trim();
  const { meetingsQuery, searchQuery, workspace, workspaceQuery } = useMeetingLibrary(
    normalizedSearchText.length >= 2 ? normalizedSearchText : "",
  );
  const isSearching = normalizedSearchText.length >= 2;
  const searchMatches = useMemo(
    () => Object.fromEntries((searchQuery.data ?? []).map((result) => [result.id, result.match])),
    [searchQuery.data],
  );
  if (workspaceQuery.isPending || (workspace && meetingsQuery.isPending)) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-3 px-6 py-6 md:grid-cols-2">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
    );
  }
  const error =
    workspaceQuery.error ?? meetingsQuery.error ?? (isSearching ? searchQuery.error : null);
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "加载会议记录失败"}
        </p>
        <Button
          onClick={() => void (isSearching ? searchQuery.refetch() : meetingsQuery.refetch())}
          type="button"
          variant="outline"
        >
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
      <Input
        aria-label="搜索会议记录"
        onChange={(event) => setSearchText(event.currentTarget.value)}
        placeholder="搜索标题、创建人、日期、转录或 Notes"
        type="search"
        value={searchText}
      />
      {isSearching && searchQuery.isPending ? (
        <p className="text-muted-foreground text-sm">正在搜索…</p>
      ) : null}
      {searchText.trim().length === 1 ? (
        <p className="text-muted-foreground text-sm">至少输入 2 个字符</p>
      ) : null}
      <MeetingLibraryView
        emptyDescription={isSearching ? "换个关键词试试" : undefined}
        emptyTitle={isSearching ? "没有找到有权访问的会议" : undefined}
        meetings={isSearching ? (searchQuery.data ?? []) : (meetingsQuery.data ?? [])}
        renderMeeting={(meeting, content) => (
          <Link
            className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            params={{ meetingId: meeting.id }}
            search={() => {
              const match = isSearching
                ? searchQuery.data?.find((result) => result.id === meeting.id)?.match
                : undefined;
              return match?.startMs === null || match?.startMs === undefined
                ? {}
                : { at: match.startMs / 1000 };
            }}
            to="/meetings/$meetingId"
          >
            {content}
          </Link>
        )}
        searchMatches={searchMatches}
      />
    </div>
  );
}
