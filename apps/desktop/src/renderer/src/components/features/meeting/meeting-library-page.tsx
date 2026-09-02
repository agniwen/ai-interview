import { Link } from "@tanstack/react-router";
import type { MeetingProcessingState } from "@app/shared/meeting-recording";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterMeetingRecords } from "./meeting-library-filters";
import { MeetingLibraryView } from "./meeting-library-view";
import { MeetingTrashView } from "./meeting-trash-view";
import { useMeetingLibrary } from "./use-meeting-library";

function LoadingLibrary() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3 px-6 py-6 md:grid-cols-2">
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-36 rounded-2xl" />
    </div>
  );
}

type LibraryRefetch = () => Promise<void>;

function visibleLibraryError(input: {
  isSearching: boolean;
  meetingsError: Error | null;
  searchError: Error | null;
  showTrash: boolean;
  workspaceError: Error | null;
}): Error | null {
  const baseError = input.workspaceError ?? input.meetingsError;
  if (baseError || input.showTrash) {
    return baseError;
  }
  return input.isSearching ? input.searchError : null;
}

function refetchVisibleLibrary(input: {
  isSearching: boolean;
  refetchMeetings: LibraryRefetch;
  refetchSearch: LibraryRefetch;
}): Promise<void> {
  return input.isSearching ? input.refetchSearch() : input.refetchMeetings();
}

function ActiveMeetingLibrary({
  dateFilter,
  isSearching,
  meetings,
  onDateFilterChange,
  onResetFilters,
  onSearchChange,
  onStatusFilterChange,
  searchPending,
  searchResults,
  searchText,
  statusFilter,
}: {
  dateFilter: string;
  isSearching: boolean;
  meetings: ReturnType<typeof useMeetingLibrary>["meetingsQuery"]["data"];
  onDateFilterChange: (value: string) => void;
  onResetFilters: () => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | MeetingProcessingState) => void;
  searchPending: boolean;
  searchResults: ReturnType<typeof useMeetingLibrary>["searchQuery"]["data"];
  searchText: string;
  statusFilter: "all" | MeetingProcessingState;
}) {
  const searchMatches = useMemo(
    () => Object.fromEntries((searchResults ?? []).map((result) => [result.id, result.match])),
    [searchResults],
  );
  const hasStructuredFilters = Boolean(dateFilter || statusFilter !== "all");
  const records = filterMeetingRecords(isSearching ? (searchResults ?? []) : (meetings ?? []), {
    date: dateFilter,
    status: statusFilter,
  });
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <Input
          aria-label="搜索录制关键词"
          className="col-span-2 min-w-0 sm:w-64"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="搜索标题、转录或 Notes"
          type="search"
          value={searchText}
        />
        <Select<"all" | MeetingProcessingState>
          onValueChange={(value) => onStatusFilterChange(value ?? "all")}
          value={statusFilter}
        >
          <SelectTrigger aria-label="筛选录制状态" className="w-full sm:w-40">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="processing">处理中</SelectItem>
              <SelectItem value="ready">可播放</SelectItem>
              <SelectItem value="failed">处理失败</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <DatePicker
          aria-label="筛选录制日期"
          className="w-full sm:w-44"
          onValueChange={onDateFilterChange}
          placeholder="全部日期"
          value={dateFilter}
        />
        <Button
          aria-label="重置录制筛选"
          className="shrink-0"
          disabled={!(searchText || hasStructuredFilters)}
          onClick={onResetFilters}
          size="icon"
          type="button"
          variant="outline"
        >
          <Icon icon="ph:funnel-x" />
        </Button>
      </div>
      {isSearching && searchPending ? (
        <p className="text-muted-foreground text-sm">正在搜索…</p>
      ) : null}
      {searchText.trim().length === 1 ? (
        <p className="text-muted-foreground text-sm">至少输入 2 个字符</p>
      ) : null}
      <MeetingLibraryView
        emptyDescription={isSearching || hasStructuredFilters ? "调整筛选条件后再试" : undefined}
        emptyTitle={isSearching || hasStructuredFilters ? "没有找到匹配的录制" : undefined}
        meetings={records}
        renderMeeting={(meeting, content) => {
          const match = isSearching
            ? searchResults?.find((result) => result.id === meeting.id)?.match
            : undefined;
          const startMs = match?.startMs;
          const search = startMs === null || startMs === undefined ? {} : { at: startMs / 1000 };
          const hasTimedHit = startMs !== null && startMs !== undefined;
          // 带时间的搜索命中进入「更多信息」页，由播放器消费 at search param。
          // Timed search hits open the More page so the player can consume the at search param.
          return (
            <Link
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              params={{ meetingId: meeting.id }}
              search={search}
              to={hasTimedHit ? "/meetings/$meetingId/more" : "/meetings/$meetingId"}
            >
              {content}
            </Link>
          );
        }}
        searchMatches={searchMatches}
      />
    </>
  );
}

/**
 * Meeting Library 的模式协调器：普通列表、全文搜索与归档记录互斥展示，并只暴露当前模式的错误/重试。
 * Mode coordinator for mutually visible list, full-text search, and archive views with mode-specific errors and retries.
 */
type LibraryTab = "records" | "archive";

export function MeetingLibraryPage() {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MeetingProcessingState>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("records");
  const showTrash = libraryTab === "archive";
  useEffect(() => {
    // useDeferredValue 不是网络 debounce；显式 250ms 延迟可避免逐键触发数据库搜索。
    // useDeferredValue is not a network debounce; an explicit 250ms delay prevents per-keystroke DB searches.
    const timer = window.setTimeout(() => setDebouncedSearchText(searchText), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);
  const normalizedSearchText = debouncedSearchText.trim();
  const { meetingsQuery, searchQuery, workspace, workspaceQuery } = useMeetingLibrary(
    normalizedSearchText.length >= 2 ? normalizedSearchText : "",
  );
  const isSearching = normalizedSearchText.length >= 2;
  const isInitialLoading =
    workspaceQuery.isPending || Boolean(workspace && meetingsQuery.isPending);
  const error = visibleLibraryError({
    isSearching,
    meetingsError: meetingsQuery.error,
    searchError: searchQuery.error,
    showTrash,
    workspaceError: workspaceQuery.error,
  });
  if (!isInitialLoading && error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">{error.message}</p>
        <Button
          onClick={async () => {
            await refetchVisibleLibrary({
              isSearching,
              refetchMeetings: async () => {
                await meetingsQuery.refetch();
              },
              refetchSearch: async () => {
                await searchQuery.refetch();
              },
            });
          }}
          type="button"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  }
  if (!(isInitialLoading || workspace)) {
    return <p className="px-6 py-16 text-center text-muted-foreground text-sm">未加入工作区</p>;
  }
  return (
    <SkeletonReveal loading={isInitialLoading} skeleton={<LoadingLibrary />}>
      {workspace ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 pb-10 sm:px-6">
          <Tabs
            className="gap-4"
            onValueChange={(value) => {
              if (value === "archive" || value === "records") {
                setLibraryTab(value);
              }
            }}
            value={libraryTab}
          >
            <TabsList>
              <TabsTrigger value="records">录制记录</TabsTrigger>
              <TabsTrigger value="archive">归档记录</TabsTrigger>
            </TabsList>
            <TabsContent className="flex flex-col gap-4" value="records">
              <p className="text-muted-foreground text-sm">浏览和播放你保存的录制</p>
              <ActiveMeetingLibrary
                dateFilter={dateFilter}
                isSearching={isSearching}
                meetings={meetingsQuery.data}
                onDateFilterChange={setDateFilter}
                onResetFilters={() => {
                  setSearchText("");
                  setDebouncedSearchText("");
                  setStatusFilter("all");
                  setDateFilter("");
                }}
                onSearchChange={setSearchText}
                onStatusFilterChange={setStatusFilter}
                searchPending={searchQuery.isPending}
                searchResults={searchQuery.data}
                searchText={searchText}
                statusFilter={statusFilter}
              />
            </TabsContent>
            <TabsContent className="flex flex-col gap-4" value="archive">
              <p className="text-muted-foreground text-sm">归档录制保留七天，截止前可恢复</p>
              <MeetingTrashView slug={workspace.slug} />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </SkeletonReveal>
  );
}
