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
