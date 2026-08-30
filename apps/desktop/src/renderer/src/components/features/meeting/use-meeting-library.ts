import { useQuery } from "@tanstack/react-query";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import { APP_TIME_ZONE } from "@/lib/client/datetime";
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
  // 日期搜索与 UI 展示统一使用东八区，避免本机时区漂移。
  const timeZone = APP_TIME_ZONE;
  const searchQuery = useQuery({
    enabled: Boolean(workspace && normalizedSearch),
    queryFn: ({ signal }) =>
      searchMeetings(workspace?.slug ?? "", normalizedSearch, timeZone, signal),
    queryKey: desktopMeetingKeys.search(workspace?.slug ?? "", normalizedSearch, timeZone),
    staleTime: 5000,
  });
  return { meetingsQuery, searchQuery, workspace, workspaceQuery };
}
