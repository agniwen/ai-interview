import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { RECORDING_TITLE_MAX_LENGTH } from "@arc/shared/meeting-recording";
import {
  Alert,
  AlertAction,
  AlertActionButton,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  desktopMeetingKeys,
  fetchMeetingDetail,
  fetchMeetingPlayback,
  fetchMeetingTranscript,
  renameMeeting,
  retryMeetingPlayback,
  retryMeetingTranscript,
} from "@/lib/client/meetings";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import type { MeetingDetail, MeetingPlaybackAuthorization } from "@arc/shared/meeting-recording";
import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import type { LiveTranscriptDraftSnapshot } from "@/lib/meeting-capture/live-transcript-draft";
import { meetingCapture } from "@/lib/meeting-capture";
import { MeetingCaptureComposer, MeetingInterruptedComposer } from "./meeting-capture-status";
import {
  canRetryMeetingProcessing,
  localStoredDraftStatus,
  localWorkspaceSaveLabel,
  meetingDetailRefetchInterval,
  playbackAuthorizationRefetchInterval,
  sessionDetailStatus,
} from "./meeting-detail-helpers";
import type { MeetingPostSaveStep } from "./meeting-detail-helpers";
import { canManageMeetingLifecycle } from "./meeting-lifecycle-panel";
import { LiveTranscriptDraftPanel } from "./live-transcript-draft-panel";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";
import {
  useMeetingCaptureSnapshot,
  useMeetingLiveTranscriptDraft,
  useMeetingRecordingActions,
} from "./meeting-recording-context";
import { MeetingPlaybackComposer } from "./meeting-audio-player";
import { MeetingTranscriptStage } from "./meeting-transcript-panel";
import { MeetingDetailTitle } from "./meeting-detail-title";
import { resolvedMeetingTitle } from "./meeting-recording-title";

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
  sessionState: Parameters<typeof localStoredDraftStatus>[0],
): LiveTranscriptDraftSnapshot {
  const status = localStoredDraftStatus(sessionState);
  return {
    captureId,
    droppedAudioMs: draft?.droppedAudioMs ?? 0,
    droppedPcmFrames: draft?.droppedPcmFrames ?? 0,
    error: draft?.error ?? null,
    queuePeakAudioMs: 0,
    queuedAudioMs: 0,
    queuedPcmBytes: 0,
    sections: draft?.sections ?? [],
    status,
    trackDroppedAudioMs: { microphone: 0, system: 0 },
    trackQueuePeakAudioMs: { microphone: 0, system: 0 },
    trackQueuedAudioMs: { microphone: 0, system: 0 },
    trackStatus: { microphone: status, system: status },
    turns: draft?.turns ?? [],
  };
}

function SessionDraftBadge() {
  return (
    <span className="w-fit rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 dark:text-amber-300">
      录制草稿
    </span>
  );
}

function sessionComposer(input: {
  interrupted: boolean;
  onContinueInterrupted: () => void;
  onPlaybackError: () => void;
  onSaveInterrupted: () => void;
  playback: MeetingPlaybackAuthorization | null | undefined;
  seekToSeconds?: number;
}): ReactNode {
  if (input.interrupted) {
    return (
      <MeetingInterruptedComposer
        onContinue={input.onContinueInterrupted}
        onSave={input.onSaveInterrupted}
      />
    );
  }
  if (!input.playback) {
    return undefined;
  }
  return (
    <MeetingPlaybackComposer
      onPlaybackError={input.onPlaybackError}
      playback={input.playback}
      seekToSeconds={input.seekToSeconds}
    />
  );
}

function MeetingLocalTranscriptStage({
  localDraft,
}: {
  localDraft: LiveTranscriptDraftSnapshot | null;
}) {
  if (localDraft) {
    return (
      <LiveTranscriptDraftPanel
        embedded
        emptyHint="尚未保存到实时字幕草稿；本地双轨录音仍可恢复"
        snapshot={localDraft}
      />
    );
  }
  return (
    <p className="text-center text-muted-foreground text-sm">
      录音已安全保存在本地，工作区验证完成后将在此展示字幕。
    </p>
  );
}

const MORE_LABEL_MIN_WIDTH_PX = 62 * 16;

function sessionStatusAlertTitle(id: MeetingPostSaveStep["id"]): string {
  if (id === "upload") {
    return "上传失败";
  }
  if (id === "playback") {
    return "录音生成失败";
  }
  return "转录失败";
}

function MeetingMoreEntryButton({ meetingId }: { meetingId: string }) {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [showsLabel, setShowsLabel] = useState(false);
  useEffect(() => {
    const container = trigger?.closest("[data-slot=meeting-session-layout]");
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const update = () => {
      setShowsLabel(container.clientWidth >= MORE_LABEL_MIN_WIDTH_PX);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [trigger]);
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="查看更多"
              className="absolute top-4 right-4 z-20 inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 font-normal text-[13px] leading-none text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:bg-background dark:hover:bg-sidebar-accent @[62rem]:border-transparent @[62rem]:px-2.5 [&_svg]:block"
              nativeButton={false}
              ref={setTrigger}
              render={<Link params={{ meetingId }} to="/meetings/$meetingId/more" />}
              size="sm"
              variant="outline"
            />
          }
        >
          <Icon
            className="flex size-3.5 shrink-0 items-center justify-center"
            icon="ph:squares-four"
          />
          <span className="hidden leading-none @[62rem]:inline">查看更多</span>
        </TooltipTrigger>
        <TooltipContent align="end" hidden={showsLabel} side="bottom">
          查看更多
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MeetingDetailHeader({
  canRename,
  draftBadge,
  editingTitle,
  isEditingTitle,
  meeting,
  onCancelTitleEditing,
  onChangeTitle,
  onEditTitle,
  onRenameTitle,
  onRetryPlayback,
  onRetryTranscript,
  onRetryUpload,
  renamePending,
  retryPlaybackPending,
  retryTranscriptPending,
  retryUploadPending,
  status,
  title,
}: {
  canRename: boolean;
  draftBadge?: ReactNode;
  editingTitle: string;
  isEditingTitle: boolean;
  meeting: MeetingDetail | undefined;
  onCancelTitleEditing: () => void;
  onChangeTitle: (title: string) => void;
  onEditTitle: () => void;
  onRenameTitle: () => void;
  onRetryPlayback: () => void;
  onRetryTranscript: () => void;
  onRetryUpload?: () => void;
  renamePending: boolean;
  retryPlaybackPending: boolean;
  retryTranscriptPending: boolean;
  retryUploadPending?: boolean;
  status: MeetingPostSaveStep | null;
  title: string;
}) {
  const canRetry = meeting ? canRetryMeetingProcessing(meeting.accessRole) : Boolean(onRetryUpload);

  function retryButtonLabel(): string {
    if (status?.id === "upload") {
      return retryUploadPending ? "正在重试…" : (status.retryLabel ?? "重试");
    }
    if (status?.id === "playback") {
      return retryPlaybackPending ? "正在重试…" : (status.retryLabel ?? "重试");
    }
    return retryTranscriptPending ? "正在重试…" : (status?.retryLabel ?? "重试");
  }

  function retry(): void {
    if (status?.id === "upload") {
      onRetryUpload?.();
      return;
    }
    if (status?.id === "playback") {
      onRetryPlayback();
      return;
    }
    onRetryTranscript();
  }

  function isRetryPending(): boolean {
    if (status?.id === "upload") {
      return Boolean(retryUploadPending);
    }
    if (status?.id === "playback") {
      return retryPlaybackPending;
    }
    return retryTranscriptPending;
  }

  return (
    <header className={meeting ? "flex flex-col gap-3 pr-12 @[62rem]:pr-0" : "flex flex-col gap-3"}>
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
      {status?.failed ? (
        <Alert className="border-0 px-4 py-3" variant="error">
          <Icon icon="ph:warning-circle" />
          <AlertTitle>{sessionStatusAlertTitle(status.id)}</AlertTitle>
          <AlertDescription>{status.label}</AlertDescription>
          {canRetry && status.retryLabel ? (
            <AlertAction>
              <AlertActionButton disabled={isRetryPending()} onClick={retry}>
                {retryButtonLabel()}
              </AlertActionButton>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}
      {status && !status.failed ? (
        <p className="text-muted-foreground text-xs">{status.label}</p>
      ) : null}
      {draftBadge}
    </header>
  );
}

/**
 * Meeting session 主页：录制中展示实时字幕与 composer；结束后同一位置换成回放条。
 * Session landing page: live composer while recording, playback bar after the session ends.
 */
// oxlint-disable-next-line complexity -- The route boundary selects active, durable-local, and remote session states.
export function MeetingDetailPage({
  meetingId,
  seekToSeconds,
}: {
  meetingId: string;
  seekToSeconds?: number;
}) {
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
  const playbackQuery = useQuery({
    enabled: Boolean(workspace && detailQuery.data?.recordingAvailable && !isActiveCapture),
    queryFn: () => fetchMeetingPlayback(workspaceSlug, meetingId),
    queryKey: desktopMeetingKeys.playback(workspaceSlug, meetingId),
    refetchInterval: (query) => playbackAuthorizationRefetchInterval(query.state.data),
    staleTime: 4 * 60 * 1000,
  });
  const retryPlaybackMutation = useMutation({
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
  const transcriptQuery = useQuery({
    enabled: Boolean(workspace) && !isActiveCapture,
    queryFn: () => fetchMeetingTranscript(workspaceSlug, meetingId),
    queryKey: desktopMeetingKeys.transcript(workspaceSlug, meetingId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "pending" || state === "processing" ? 5000 : false;
    },
    retry: isLocalSession ? false : 1,
    staleTime: 5000,
  });
  const retryTranscriptMutation = useMutation({
    mutationFn: () => retryMeetingTranscript(workspaceSlug, meetingId),
    onSuccess: async () => {
      if (!workspace) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: desktopMeetingKeys.transcript(workspace.slug, meetingId),
      });
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

  const title = resolvedMeetingTitle({
    localTitle: localSession?.title,
    remoteTitle: meeting?.title,
  });
  const canRename = Boolean(
    localSession || (meeting && canManageMeetingLifecycle(meeting.accessRole)),
  );
  const localDraft = localSession
    ? storedDraftSnapshot(meetingId, localSession.liveTranscriptDraft, localSession.state)
    : null;
  const isCompletedSession = Boolean(
    meeting ||
    (localSession && !["recording", "paused", "interrupted"].includes(localSession.state)),
  );
  const workspaceSave = captureSnapshot.workspaceSaves.find((item) => item.captureId === meetingId);
  const uploadLabel =
    workspaceSave && workspaceSave.state !== "workspace-verified"
      ? (workspaceSave.error ?? localWorkspaceSaveLabel(workspaceSave.state))
      : undefined;
  const showDraftBadge =
    (transcriptQuery.data?.draft?.turns.length ?? 0) > 0 || (localDraft?.turns.length ?? 0) > 0;
  const playback = playbackQuery.data;
  const showPlaybackBar = Boolean(playback) && localSession?.state !== "interrupted";

  return (
    <MeetingRecordingSessionLayout
      composer={sessionComposer({
        interrupted: localSession?.state === "interrupted",
        onContinueInterrupted: () => void continueInterruptedRecording(meetingId),
        onPlaybackError: () => {
          void playbackQuery.refetch();
        },
        onSaveInterrupted: () => void saveRecording(meetingId),
        playback,
        seekToSeconds,
      })}
      overlay={meeting ? <MeetingMoreEntryButton meetingId={meetingId} /> : null}
      main={
        <div
          className={
            showPlaybackBar
              ? "container mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 pb-24 sm:px-6"
              : "container mx-auto flex min-h-full max-w-3xl flex-col gap-4 px-4 pb-10 sm:px-6"
          }
        >
          <MeetingDetailHeader
            canRename={canRename}
            draftBadge={showDraftBadge ? <SessionDraftBadge /> : null}
            editingTitle={editingTitle}
            isEditingTitle={isEditingTitle}
            meeting={meeting ?? undefined}
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
            onRetryPlayback={() => retryPlaybackMutation.mutate()}
            onRetryTranscript={() => retryTranscriptMutation.mutate()}
            onRetryUpload={() => void saveRecording(meetingId)}
            renamePending={renameMutation.isPending}
            retryPlaybackPending={retryPlaybackMutation.isPending}
            retryTranscriptPending={retryTranscriptMutation.isPending}
            status={sessionDetailStatus({
              playbackState: meeting?.processingState,
              transcript: transcriptQuery.data,
              uploadFailed: workspaceSave?.state === "action-required",
              uploadLabel,
            })}
            title={title}
          />
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
