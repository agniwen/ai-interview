import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { MeetingProcessingState } from "@arc/shared/meeting-recording";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { desktopMeetingKeys, fetchTrashedMeetings } from "@/lib/client/meetings";
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

function visibleLibraryError(input: {
  isSearching: boolean;
  meetingsError: unknown;
  searchError: unknown;
  showTrash: boolean;
  trashError: unknown;
  workspaceError: unknown;
}): unknown {
  const baseError = input.workspaceError ?? input.meetingsError;
  if (baseError || input.showTrash) {
    return baseError ?? input.trashError;
  }
  return input.isSearching ? input.searchError : null;
}

function refetchVisibleLibrary(input: {
  isSearching: boolean;
  refetchMeetings: () => Promise<unknown>;
  refetchSearch: () => Promise<unknown>;
  refetchTrash: () => Promise<unknown>;
  showTrash: boolean;
}): Promise<unknown> {
  if (input.showTrash) {
    return input.refetchTrash();
  }
  return input.isSearching ? input.refetchSearch() : input.refetchMeetings();
}

function ActiveMeetingLibrary({
  creatorFilter,
  dateFilter,
  isSearching,
  meetings,
  onCreatorFilterChange,
  onDateFilterChange,
  onResetFilters,
  onSearchChange,
  onStatusFilterChange,
  searchPending,
  searchResults,
  searchText,
  statusFilter,
}: {
  creatorFilter: string;
  dateFilter: string;
  isSearching: boolean;
  meetings: ReturnType<typeof useMeetingLibrary>["meetingsQuery"]["data"];
  onCreatorFilterChange: (value: string) => void;
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
  const creatorOptions = useMemo(
    () =>
      [
        ...new Map(
          (meetings ?? []).map((meeting) => [meeting.creator.id, meeting.creator]),
        ).values(),
      ]
        .map((creator) => ({ label: creator.name, value: creator.id }))
        .toSorted((left, right) => left.label.localeCompare(right.label, "zh-CN")),
    [meetings],
  );
  const hasStructuredFilters = Boolean(creatorFilter || dateFilter || statusFilter !== "all");
  const records = filterMeetingRecords(isSearching ? (searchResults ?? []) : (meetings ?? []), {
    creatorId: creatorFilter,
    date: dateFilter,
    status: statusFilter,
  });
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
        <Input
          aria-label="搜索会议关键词"
          className="col-span-2 min-w-0 sm:w-64"
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="搜索标题、转录或 Notes"
          type="search"
          value={searchText}
        />
        <SearchableSelect
          clearable
          emptyMessage="没有匹配的创建人"
          onChange={(value) => onCreatorFilterChange(value ?? "")}
          options={creatorOptions}
          placeholder="全部创建人"
          searchPlaceholder="搜索创建人…"
          triggerClassName="w-full sm:w-44"
          value={creatorFilter || null}
        />
        <Select<"all" | MeetingProcessingState>
          onValueChange={(value) => onStatusFilterChange(value ?? "all")}
          value={statusFilter}
        >
          <SelectTrigger aria-label="筛选会议状态" className="w-full sm:w-40">
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
          aria-label="筛选会议日期"
          className="w-full sm:w-44"
          onValueChange={onDateFilterChange}
          placeholder="全部日期"
          value={dateFilter}
        />
        <Button
          aria-label="重置会议筛选"
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
        emptyTitle={isSearching || hasStructuredFilters ? "没有找到匹配的会议" : undefined}
        meetings={records}
        renderMeeting={(meeting, content) => {
          const match = isSearching
            ? searchResults?.find((result) => result.id === meeting.id)?.match
            : undefined;
          const search =
            match?.startMs === null || match?.startMs === undefined
              ? {}
              : { at: match.startMs / 1000 };
          // 带时间的搜索命中进入「更多信息」页，由播放器消费 at search param。
          // Timed search hits open the More page so the player can consume the at search param.
          const hasTimedHit = typeof match?.startMs === "number";
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
 * Meeting Library 的模式协调器：普通列表、全文搜索与废纸篓互斥展示，并只暴露当前模式的错误/重试。
 * Mode coordinator for mutually visible list, full-text search, and trash views with mode-specific errors and retries.
 */
export function MeetingLibraryPage() {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MeetingProcessingState>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [showTrash, setShowTrash] = useState(false);
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
  const trashQuery = useQuery({
    enabled: Boolean(showTrash && workspace),
    queryFn: () => fetchTrashedMeetings(workspace?.slug ?? ""),
    queryKey: desktopMeetingKeys.trash(workspace?.slug ?? ""),
    staleTime: 5000,
  });
  if (workspaceQuery.isPending || (workspace && meetingsQuery.isPending)) {
    return <LoadingLibrary />;
  }
  const error = visibleLibraryError({
    isSearching,
    meetingsError: meetingsQuery.error,
    searchError: searchQuery.error,
    showTrash,
    trashError: trashQuery.error,
    workspaceError: workspaceQuery.error,
  });
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "加载会议记录失败"}
        </p>
        <Button
          onClick={() =>
            void refetchVisibleLibrary({
              isSearching,
              refetchMeetings: meetingsQuery.refetch,
              refetchSearch: searchQuery.refetch,
              refetchTrash: trashQuery.refetch,
              showTrash,
            })
          }
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
  let content = (
    <ActiveMeetingLibrary
      creatorFilter={creatorFilter}
      dateFilter={dateFilter}
      isSearching={isSearching}
      meetings={meetingsQuery.data}
      onCreatorFilterChange={setCreatorFilter}
      onDateFilterChange={setDateFilter}
      onResetFilters={() => {
        setSearchText("");
        setDebouncedSearchText("");
        setCreatorFilter("");
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
  );
  if (showTrash) {
    content = trashQuery.isPending ? (
      <p className="text-muted-foreground text-sm">正在加载废纸篓…</p>
    ) : (
      <MeetingTrashView meetings={trashQuery.data ?? []} slug={workspace.slug} />
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 pb-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-xl tracking-tight">
            {showTrash ? "会议废纸篓" : "会议记录"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {showTrash ? "会议保留七天，截止前可恢复" : "浏览和播放你有权访问的私有会议"}
          </p>
        </div>
        <Button onClick={() => setShowTrash((current) => !current)} type="button" variant="outline">
          {showTrash ? "返回会议记录" : "废纸篓"}
        </Button>
      </div>
      {content}
    </div>
  );
}
