import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  desktopMeetingKeys,
  fetchMeetingDetail,
  renameMeeting,
  retryMeetingPlayback,
} from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import type { MeetingDetail } from "@arc/shared/meeting-recording";
import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import type { LiveTranscriptDraftSnapshot } from "@/lib/meeting-capture/live-transcript-draft";
import { meetingCapture } from "@/lib/meeting-capture";
import { MeetingCaptureComposer, MeetingInterruptedComposer } from "./meeting-capture-status";
import { canRetryMeetingProcessing, meetingDetailRefetchInterval } from "./meeting-detail-helpers";
import { canManageMeetingLifecycle } from "./meeting-lifecycle-panel";
import { LiveTranscriptDraftPanel } from "./live-transcript-draft-panel";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";
import {
  useMeetingCaptureSnapshot,
  useMeetingLiveTranscriptDraft,
  useMeetingRecordingActions,
} from "./meeting-recording-context";
import { MeetingTranscriptStage } from "./meeting-transcript-panel";
import { meetingDisplayTitle } from "@arc/shared/utils/time";
import { MeetingDetailTitle } from "./meeting-detail-title";

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
        返回录制记录
      </Button>
    </div>
  );
}

function storedDraftSnapshot(
  captureId: string,
  draft: MeetingLiveTranscriptDraft | null,
): LiveTranscriptDraftSnapshot {
  return {
    captureId,
    droppedAudioMs: draft?.droppedAudioMs ?? 0,
    droppedPcmFrames: draft?.droppedPcmFrames ?? 0,
    error: draft?.error ?? null,
    queuePeakAudioMs: 0,
    queuedAudioMs: 0,
    queuedPcmBytes: 0,
    sections: draft?.sections ?? [],
    status: "interrupted",
    trackDroppedAudioMs: { microphone: 0, system: 0 },
    trackQueuePeakAudioMs: { microphone: 0, system: 0 },
    trackQueuedAudioMs: { microphone: 0, system: 0 },
    trackStatus: { microphone: "interrupted", system: "interrupted" },
    turns: draft?.turns ?? [],
  };
}

function MeetingLocalTranscriptStage({
  localDraft,
}: {
  localDraft: LiveTranscriptDraftSnapshot | null;
}) {
  if (localDraft) {
    return (
      <LiveTranscriptDraftPanel
        emptyHint="尚未保存到实时字幕草稿；本地双轨录音仍可恢复"
        snapshot={localDraft}
      />
    );
  }
  return (
    <div className="container mx-auto flex max-w-3xl flex-1 items-center justify-center px-4 pb-10 sm:px-6">
      <p className="text-center text-muted-foreground text-sm">
        录音已安全保存在本地，工作区验证完成后将在此展示字幕。
      </p>
    </div>
  );
}

function MeetingDetailHeader({
  canRename,
  editingTitle,
  isEditingTitle,
  meeting,
  meetingId,
  onCancelTitleEditing,
  onChangeTitle,
  onEditTitle,
  onRenameTitle,
  onRetry,
  renamePending,
  retryPending,
  title,
}: {
  canRename: boolean;
  editingTitle: string;
  isEditingTitle: boolean;
  meeting: MeetingDetail | undefined;
  meetingId: string;
  onCancelTitleEditing: () => void;
  onChangeTitle: (title: string) => void;
  onEditTitle: () => void;
  onRenameTitle: () => void;
  onRetry: () => void;
  renamePending: boolean;
  retryPending: boolean;
  title: string;
}) {
  const processing = meeting?.processingState === "processing";
  const failed = meeting?.processingState === "failed";
  const canRetry = meeting ? canRetryMeetingProcessing(meeting.accessRole) : false;

  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <MeetingDetailTitle
          canRename={canRename}
          editingTitle={editingTitle}
          isEditing={isEditingTitle}
          isPending={renamePending}
          onCancel={onCancelTitleEditing}
          onChange={onChangeTitle}
          onEdit={onEditTitle}
          onSubmit={onRenameTitle}
          title={title}
        />
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
// oxlint-disable-next-line complexity -- The route boundary selects active, durable-local, and remote session states.
export function MeetingDetailPage({ meetingId }: { meetingId: string; seekToSeconds?: number }) {
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const captureSnapshot = useMeetingCaptureSnapshot();
  const liveDraft = useMeetingLiveTranscriptDraft();
  const { continueInterruptedRecording, pauseRecording, resumeRecording, saveRecording } =
    useMeetingRecordingActions();

  const isActiveCapture = captureSnapshot.active?.captureId === meetingId;
  const isLocalSaved = captureSnapshot.saved?.captureId === meetingId;
  const localSession = captureSnapshot.localSessions.find((session) => session.id === meetingId);
  const isLocalSession = Boolean(isActiveCapture || isLocalSaved || localSession);

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
  const renameMutation = useMutation({
    mutationFn: (
      input:
        | { meetingId: string; source: "local"; title: string }
        | { meetingId: string; slug: string; source: "remote"; title: string },
    ) =>
      input.source === "local"
        ? meetingCapture.updateLocalSession(input.meetingId, { title: input.title })
        : renameMeeting(input.slug, input.meetingId, input.title),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "修改录制名称失败");
    },
    onSuccess: async (_, input) => {
      if (input.source === "remote") {
        await Promise.all([
          queryClient.invalidateQueries({
            exact: true,
            queryKey: desktopMeetingKeys.all(input.slug),
          }),
          queryClient.invalidateQueries({
            exact: true,
            queryKey: desktopMeetingKeys.detail(input.slug, input.meetingId),
          }),
          queryClient.invalidateQueries({ queryKey: desktopMeetingKeys.searchRoot(input.slug) }),
        ]);
      }
      setIsEditingTitle(false);
      setEditingTitle("");
    },
  });

  if (isActiveCapture) {
    return (
      <MeetingRecordingSessionLayout
        composer={
          <MeetingCaptureComposer
            onPause={() => void pauseRecording()}
            onResume={() => void resumeRecording()}
            onSave={(captureId) => void saveRecording(captureId)}
            snapshot={captureSnapshot}
          />
        }
        main={<LiveTranscriptDraftPanel snapshot={liveDraft} />}
      />
    );
  }

  if (workspaceQuery.isPending || (detailQuery.isPending && !isLocalSession)) {
    return <Skeleton className="mx-auto mt-6 h-64 w-[min(56rem,calc(100%-3rem))] rounded-2xl" />;
  }

  const meeting = detailQuery.data;
  if (!(meeting || isLocalSession)) {
    const error = workspaceQuery.error ?? detailQuery.error;
    return (
      <MeetingDetailUnavailable
        message={error instanceof Error ? error.message : "会议不存在或你无权访问"}
      />
    );
  }

  const title = meeting
    ? meetingDisplayTitle(meeting.title)
    : meetingDisplayTitle(localSession?.title ?? "本地录音");
  const canRename = Boolean(
    localSession || (meeting && canManageMeetingLifecycle(meeting.accessRole)),
  );
  const localDraft = localSession
    ? storedDraftSnapshot(meetingId, localSession.liveTranscriptDraft)
    : null;
  const isCompletedSession = Boolean(
    meeting ||
    (localSession && !["recording", "paused", "interrupted"].includes(localSession.state)),
  );

  return (
    <MeetingRecordingSessionLayout
      composer={
        localSession?.state === "interrupted" ? (
          <MeetingInterruptedComposer
            onContinue={() => void continueInterruptedRecording(meetingId)}
            onSave={() => void saveRecording(meetingId)}
          />
        ) : undefined
      }
      main={
        <div className="flex min-h-full flex-col gap-6">
          <div className="container mx-auto max-w-3xl px-4 sm:px-6">
            <MeetingDetailHeader
              canRename={canRename}
              editingTitle={editingTitle}
              isEditingTitle={isEditingTitle}
              meeting={meeting ?? undefined}
              meetingId={meetingId}
              onCancelTitleEditing={() => {
                setIsEditingTitle(false);
                setEditingTitle("");
              }}
              onChangeTitle={setEditingTitle}
              onEditTitle={() => {
                setEditingTitle(title);
                setIsEditingTitle(true);
              }}
              onRenameTitle={() => {
                const normalizedTitle = editingTitle.trim();
                if (
                  !normalizedTitle ||
                  normalizedTitle.length > RECORDING_TITLE_MAX_LENGTH ||
                  normalizedTitle === title
                ) {
                  if (normalizedTitle === title) {
                    setIsEditingTitle(false);
                    setEditingTitle("");
                  }
                  return;
                }
                if (localSession) {
                  renameMutation.mutate({
                    meetingId,
                    source: "local",
                    title: normalizedTitle,
                  });
                  return;
                }
                if (workspace) {
                  renameMutation.mutate({
                    meetingId,
                    slug: workspace.slug,
                    source: "remote",
                    title: normalizedTitle,
                  });
                }
              }}
              onRetry={() => retryMutation.mutate()}
              renamePending={renameMutation.isPending}
              retryPending={retryMutation.isPending}
              title={title}
            />
          </div>
          {meeting ? (
            <MeetingTranscriptStage meetingId={meetingId} slug={workspaceSlug} />
          ) : (
            <MeetingLocalTranscriptStage localDraft={localDraft} />
          )}
        </div>
      }
      scrollFade={isCompletedSession}
    />
  );
}
