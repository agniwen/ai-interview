import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  desktopMeetingKeys,
  fetchMeetingDetail,
  retryMeetingPlayback,
} from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import type { MeetingDetail } from "@arc/shared/meeting-recording";
import { MeetingCaptureComposer, MeetingLocalSaveStatus } from "./meeting-capture-status";
import { canRetryMeetingProcessing, meetingDetailRefetchInterval } from "./meeting-detail-helpers";
import { LiveTranscriptDraftPanel } from "./live-transcript-draft-panel";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";
import { useMeetingRecording } from "./meeting-recording-context";
import { MeetingTranscriptPanel } from "./meeting-transcript-panel";
import { meetingDisplayTitle } from "@arc/shared/utils/time";

export {
  canRetryMeetingProcessing,
  meetingDetailRefetchInterval,
  playbackAuthorizationRefetchInterval,
} from "./meeting-detail-helpers";

function MeetingDetailUnavailable({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="font-medium text-sm">{message}</p>
      <Button nativeButton={false} render={<Link to="/meetings" />} variant="outline">
        返回会议记录
      </Button>
    </div>
  );
}

function MeetingDetailHeader({
  meeting,
  meetingId,
  onRetry,
  retryPending,
  title,
}: {
  meeting: MeetingDetail | undefined;
  meetingId: string;
  onRetry: () => void;
  retryPending: boolean;
  title: string;
}) {
  const processing = meeting?.processingState === "processing";
  const failed = meeting?.processingState === "failed";
  const canRetry = meeting ? canRetryMeetingProcessing(meeting.accessRole) : false;

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <Button
          className="h-auto px-0 text-muted-foreground"
          nativeButton={false}
          render={<Link to="/meetings" />}
          size="sm"
          variant="link"
        >
          会议记录
        </Button>
        <h1 className="truncate font-semibold text-xl">{title}</h1>
        {processing ? (
          <p className="text-muted-foreground text-xs">正在处理录音与最终转录…</p>
        ) : null}
        {failed ? (
          <div className="flex items-center gap-2">
            <p className="text-destructive text-xs">处理失败</p>
            {canRetry ? (
              <Button disabled={retryPending} onClick={onRetry} size="sm" variant="outline">
                重试处理
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {meeting ? (
        <Button
          nativeButton={false}
          render={<Link params={{ meetingId }} to="/meetings/$meetingId/more" />}
          size="sm"
          variant="outline"
        >
          <Icon className="size-4" icon="ph:info" />
          更多信息
        </Button>
      ) : null}
    </header>
  );
}

/**
 * Meeting session 主页：录制中主区实时字幕、底部 composer 控制；就绪后展示最终转录。
 * Meeting session page: live transcript stage + bottom composer while capturing; final transcript when ready.
 */
export function MeetingDetailPage({ meetingId }: { meetingId: string; seekToSeconds?: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { captureSnapshot, liveDraft, requestDiscard, saveRecording } = useMeetingRecording();

  const isActiveCapture = captureSnapshot.active?.captureId === meetingId;
  const isLocalSaved = captureSnapshot.saved?.captureId === meetingId;
  const isLocalSession = isActiveCapture || isLocalSaved;

  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 30_000,
  });
  const workspace = workspaceQuery.data;
  const workspaceSlug = workspace?.slug ?? "";
  const detailQuery = useQuery({
    enabled: Boolean(workspace) && !isActiveCapture,
    queryFn: () => fetchMeetingDetail(workspaceSlug, meetingId),
    queryKey: desktopMeetingKeys.detail(workspaceSlug, meetingId),
    refetchInterval: (query) => meetingDetailRefetchInterval(query.state.data),
    retry: isLocalSession ? false : 1,
    staleTime: 5000,
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

  const openPlaybackAt = (seconds: number) => {
    void navigate({
      params: { meetingId },
      search: { at: seconds },
      to: "/meetings/$meetingId/more",
    });
  };

  if (isActiveCapture) {
    return (
      <MeetingRecordingSessionLayout
        composer={
          <MeetingCaptureComposer
            onSave={(captureId) => void saveRecording(captureId)}
            snapshot={captureSnapshot}
          />
        }
        main={<LiveTranscriptDraftPanel snapshot={liveDraft} />}
      />
    );
  }

  if (workspaceQuery.isPending || (detailQuery.isPending && !isLocalSaved)) {
    return <Skeleton className="mx-auto mt-6 h-64 w-[min(56rem,calc(100%-3rem))] rounded-2xl" />;
  }

  const meeting = detailQuery.data;
  if (!(meeting || isLocalSaved)) {
    const error = workspaceQuery.error ?? detailQuery.error;
    return (
      <MeetingDetailUnavailable
        message={error instanceof Error ? error.message : "会议不存在或你无权访问"}
      />
    );
  }

  const title = meeting ? meetingDisplayTitle(meeting.title) : "本地录音";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 pb-10 sm:px-6">
      <MeetingDetailHeader
        meeting={meeting}
        meetingId={meetingId}
        onRetry={() => retryMutation.mutate()}
        retryPending={retryMutation.isPending}
        title={title}
      />

      {isLocalSaved ? (
        <MeetingLocalSaveStatus
          captureId={meetingId}
          onDiscard={requestDiscard}
          onSave={(captureId) => void saveRecording(captureId)}
          snapshot={captureSnapshot}
        />
      ) : null}

      {meeting ? (
        <MeetingTranscriptPanel
          accessRole={meeting.accessRole}
          meetingId={meetingId}
          onSeek={openPlaybackAt}
          slug={workspaceSlug}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-muted-foreground text-sm">
          工作区验证完成后将在此展示最终转录。
        </p>
      )}
    </div>
  );
}
