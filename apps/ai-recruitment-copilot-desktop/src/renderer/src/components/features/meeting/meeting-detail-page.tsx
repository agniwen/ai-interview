import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useReducer } from "react";
import type { MeetingDetail, MeetingPlaybackAuthorization } from "@arc/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  desktopMeetingKeys,
  fetchMeetingDetail,
  fetchMeetingPlayback,
  retryMeetingPlayback,
} from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import { MeetingDetailView } from "./meeting-library-view";
import { MeetingNotesPanel } from "./meeting-notes-panel";
import { MeetingRecruitingContextPanel } from "./meeting-recruiting-context-panel";
import { MeetingSharePanel } from "./meeting-share-panel";
import { MeetingTranscriptPanel } from "./meeting-transcript-panel";

export function canRetryMeetingProcessing(role: MeetingDetail["accessRole"]): boolean {
  return role === "administrator" || role === "owner";
}

export function meetingDetailRefetchInterval(
  meeting: MeetingDetail | null | undefined,
): number | false {
  if (meeting?.processingState === "processing") {
    return 5000;
  }
  if (meeting?.processingState === "failed") {
    return 30_000;
  }
  return false;
}

export function playbackAuthorizationRefetchInterval(
  playback: MeetingPlaybackAuthorization | null | undefined,
  now = Date.now(),
): number | false {
  if (!playback) {
    return false;
  }
  const expiresAt = Date.parse(playback.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return 60_000;
  }
  return Math.max(1000, expiresAt - now - 60_000);
}

export function MeetingDetailPage({
  meetingId,
  seekToSeconds,
}: {
  meetingId: string;
  seekToSeconds?: number;
}) {
  const queryClient = useQueryClient();
  const [seekRequest, requestSeek] = useReducer(
    (current: { id: number; seconds?: number }, seconds: number | undefined) => ({
      id: current.id + 1,
      seconds,
    }),
    { id: 0, seconds: seekToSeconds },
  );
  useEffect(() => {
    requestSeek(seekToSeconds);
  }, [seekToSeconds]);
  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 30_000,
  });
  const workspace = workspaceQuery.data;
  const workspaceSlug = workspace?.slug ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(workspace),
    queryFn: () => fetchMeetingDetail(workspaceSlug, meetingId),
    queryKey: desktopMeetingKeys.detail(workspaceSlug, meetingId),
    refetchInterval: (query) => meetingDetailRefetchInterval(query.state.data),
    staleTime: 5000,
  });
  const playbackQuery = useQuery({
    enabled: Boolean(workspace && detailQuery.data?.recordingAvailable),
    queryFn: () => fetchMeetingPlayback(workspaceSlug, meetingId),
    queryKey: desktopMeetingKeys.playback(workspaceSlug, meetingId),
    refetchInterval: (query) => playbackAuthorizationRefetchInterval(query.state.data),
    staleTime: 4 * 60 * 1000,
  });
  const retryMutation = useMutation({
    mutationFn: () => retryMeetingPlayback(workspaceSlug, meetingId),
    onSuccess: async () => {
      if (!workspace) {
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.all(workspace.slug) }),
        queryClient.invalidateQueries({
          queryKey: desktopMeetingKeys.detail(workspace.slug, meetingId),
        }),
      ]);
    },
  });
  if (workspaceQuery.isPending || detailQuery.isPending) {
    return <Skeleton className="mx-auto mt-6 h-64 w-[min(56rem,calc(100%-3rem))] rounded-2xl" />;
  }
  const error = workspaceQuery.error ?? detailQuery.error ?? playbackQuery.error;
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "加载会议详情失败"}
        </p>
        <Button
          onClick={() => {
            void Promise.all([
              workspaceQuery.refetch(),
              detailQuery.refetch(),
              ...(workspace && detailQuery.data?.recordingAvailable
                ? [playbackQuery.refetch()]
                : []),
            ]);
          }}
          type="button"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  }
  if (!detailQuery.data) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="font-medium text-sm">会议不存在或你无权访问</p>
        <Button render={<Link to="/meetings" />} variant="outline">
          返回会议记录
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 pb-10 sm:px-6">
      <Button className="self-start" render={<Link to="/meetings" />} variant="ghost">
        返回会议记录
      </Button>
      <MeetingDetailView
        meeting={detailQuery.data}
        onPlaybackError={() => {
          void playbackQuery.refetch();
        }}
        onRetryProcessing={
          canRetryMeetingProcessing(detailQuery.data.accessRole)
            ? () => retryMutation.mutate()
            : undefined
        }
        playback={playbackQuery.data ?? null}
        retryProcessing={retryMutation.isPending}
        seekRequestId={seekRequest.id}
        seekToSeconds={seekRequest.seconds}
      />
      <MeetingRecruitingContextPanel
        accessRole={detailQuery.data.accessRole}
        meetingId={meetingId}
        slug={workspaceSlug}
      />
      <MeetingTranscriptPanel
        accessRole={detailQuery.data.accessRole}
        meetingId={meetingId}
        onSeek={requestSeek}
        slug={workspaceSlug}
      />
      <MeetingNotesPanel
        accessRole={detailQuery.data.accessRole}
        meetingId={meetingId}
        slug={workspaceSlug}
      />
      <MeetingSharePanel
        accessRole={detailQuery.data.accessRole}
        meetingId={meetingId}
        slug={workspaceSlug}
      />
    </div>
  );
}
