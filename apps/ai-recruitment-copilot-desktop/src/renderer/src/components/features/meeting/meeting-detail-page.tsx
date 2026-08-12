import { Link } from "@tanstack/react-router";
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
import { MeetingCaptureComposer } from "./meeting-capture-status";
import { canRetryMeetingProcessing, meetingDetailRefetchInterval } from "./meeting-detail-helpers";
import { LiveTranscriptDraftPanel } from "./live-transcript-draft-panel";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";
import {
  useMeetingCaptureSnapshot,
  useMeetingLiveTranscriptDraft,
  useMeetingRecordingActions,
} from "./meeting-recording-context";
import { MeetingTranscriptStage } from "./meeting-transcript-panel";
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
          <Icon className="size-4" icon="ph:arrow-right" />
          查看更多
        </Button>
      ) : null}
    </header>
  );
}

/**
 * Meeting session 主页：录制中展示实时字幕与 composer；录制后保留同一字幕舞台但移除 composer。
 * Session landing page: live transcript + composer while recording, read-only transcript stage after save.
 */
export function MeetingDetailPage({ meetingId }: { meetingId: string; seekToSeconds?: number }) {
  const queryClient = useQueryClient();
  const captureSnapshot = useMeetingCaptureSnapshot();
  const liveDraft = useMeetingLiveTranscriptDraft();
  const { saveRecording } = useMeetingRecordingActions();

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
    <MeetingRecordingSessionLayout
      main={
        <div className="flex min-h-full flex-col gap-6">
          <div className="container mx-auto max-w-3xl px-4 sm:px-6">
            <MeetingDetailHeader
              meeting={meeting ?? undefined}
              meetingId={meetingId}
              onRetry={() => retryMutation.mutate()}
              retryPending={retryMutation.isPending}
              title={title}
            />
          </div>
          {meeting ? (
            <MeetingTranscriptStage meetingId={meetingId} slug={workspaceSlug} />
          ) : (
            <div className="container mx-auto flex max-w-3xl flex-1 items-center justify-center px-4 pb-10 sm:px-6">
              <p className="text-center text-muted-foreground text-sm">
                录音已安全保存在本地，工作区验证完成后将在此展示字幕。
              </p>
            </div>
          )}
        </div>
      }
    />
  );
}
