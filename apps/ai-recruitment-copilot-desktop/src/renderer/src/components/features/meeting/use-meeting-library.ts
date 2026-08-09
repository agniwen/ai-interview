import { useQuery } from "@tanstack/react-query";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import { desktopMeetingKeys, fetchMeetings, searchMeetings } from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";

export function meetingLibraryRefetchInterval(
  meetings: MeetingLibraryItem[] | undefined,
): number | false {
  if (meetings?.some((meeting) => meeting.processingState === "processing")) {
    return 5000;
  }
  if (meetings?.some((meeting) => meeting.processingState === "failed")) {
    return 30_000;
  }
  return false;
}

/**
 * Library 与 Search 的共享 Query 入口；Sidebar 和主页面复用相同 key，避免重复缓存和状态漂移。
 * Shared query entry for Library and Search, allowing sidebar/page consumers to reuse one cache namespace.
 */
export function useMeetingLibrary(searchText = "") {
  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 30_000,
  });
  const workspace = workspaceQuery.data;
  const meetingsQuery = useQuery({
    enabled: Boolean(workspace),
    queryFn: () => fetchMeetings(workspace?.slug ?? ""),
    queryKey: desktopMeetingKeys.all(workspace?.slug ?? ""),
    refetchInterval: (query) => meetingLibraryRefetchInterval(query.state.data),
    staleTime: 5000,
  });
  const normalizedSearch = searchText.trim();
  // 日期搜索必须携带用户 IANA 时区，才能与 Desktop 展示的本地日历日期一致。
  // Date search carries the user's IANA zone so results match locally rendered calendar dates.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const searchQuery = useQuery({
    enabled: Boolean(workspace && normalizedSearch),
    queryFn: ({ signal }) =>
      searchMeetings(workspace?.slug ?? "", normalizedSearch, timeZone, signal),
    queryKey: desktopMeetingKeys.search(workspace?.slug ?? "", normalizedSearch, timeZone),
    staleTime: 5000,
  });
  return { meetingsQuery, searchQuery, workspace, workspaceQuery };
}
