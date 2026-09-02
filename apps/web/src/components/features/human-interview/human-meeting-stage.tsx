"use client";

/* oxlint-disable no-use-before-define -- exported stage stays above local tile and style helpers. */

import {
  IconDeviceDesktopUp,
  IconFileDescription,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconPlayerStop,
  IconPointFilled,
  IconChecklist,
  IconUsers,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
import {
  DisconnectButton,
  ParticipantTile,
  TrackLoop,
  TrackToggle,
  useParticipants,
  useTrackRefContext,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { cn } from "@arc/shared/utils";
import type { HumanInterviewRecordingStatus } from "@arc/db-schema/studio-interviews";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { MicrophoneDeviceMenu, VoiceEffectMenu } from "./human-meeting-audio-controls";
import { shouldReturnToMeetingForLocalScreenShare } from "./human-meeting-materials-model";
import type { HumanMeetingViewMode } from "./human-meeting-materials-model";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";
import { HumanMeetingReview } from "./human-meeting-review";
import { HumanMeetingLiveTranscript } from "./human-meeting-live-transcript";
import type { HumanMeetingLiveTranscriptHandle } from "./human-meeting-live-transcript";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

const participantMetadataSchema = z.object({
  participant_role: z.string().optional(),
  participant_type: z.string().optional(),
});

interface ParticipantBadge {
  label: string;
  tone: "candidate" | "interviewer";
}

function parseParticipantMetadata(
  metadata: string | undefined,
): z.infer<typeof participantMetadataSchema> {
  if (!metadata) {
    return {};
  }
  try {
    const parsed = participantMetadataSchema.safeParse(JSON.parse(metadata));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function getParticipantBadge(trackRef: TrackReferenceOrPlaceholder): ParticipantBadge {
  const metadata = parseParticipantMetadata(trackRef.participant.metadata);
  const { identity, name: participantName } = trackRef.participant;
  let role = metadata.participant_role;
  if (metadata.participant_type === "candidate" || identity.startsWith("candidate_")) {
    role = "candidate";
  }

  let roleLabel = "面试官";
  if (role === "candidate") {
    roleLabel = "候选人";
  } else if (role === "host") {
    roleLabel = "主持人";
  } else if (role === "observer") {
    roleLabel = "旁听";
  }
  const name = participantName || identity;
  const sourceSuffix = trackRef.source === Track.Source.ScreenShare ? " · 屏幕共享" : "";

  return {
    label: `${roleLabel} · ${name}${sourceSuffix}`,
    tone: role === "candidate" ? "candidate" : "interviewer",
  };
}

async function runEndMeeting(onEndMeeting: () => Promise<void> | void): Promise<boolean> {
  try {
    await onEndMeeting();
    return true;
  } catch {
    return false;
  }
}

export interface HumanMeetingStageProps {
  canPublish: boolean;
  canUseVoiceEffects: boolean;
  canUseLiveTranscript: boolean;
  canEndMeeting: boolean;
  candidateMaterialsState: InterviewerCandidateMaterialsState;
  inviteToken: string | null;
  isEnding: boolean;
  onCandidateMaterialsStateChange: (state: InterviewerCandidateMaterialsState) => void;
  onEndMeeting: () => Promise<void> | void;
  onViewModeChange: (mode: HumanMeetingViewMode) => void;
  participantName: string;
  recordingStatus: HumanInterviewRecordingStatus;
  title: string;
  viewMode: HumanMeetingViewMode;
}

// oxlint-disable-next-line complexity -- stage rendering reflects the approved meeting, materials, sharing, recording, and review modes.
export function HumanMeetingStage({
  canPublish,
  canUseVoiceEffects,
  canUseLiveTranscript,
  canEndMeeting,
  candidateMaterialsState,
  inviteToken,
  isEnding,
  onCandidateMaterialsStateChange,
  onEndMeeting,
  onViewModeChange,
  participantName,
  recordingStatus,
  title,
  viewMode,
}: HumanMeetingStageProps) {
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const liveTranscriptRef = useRef<HumanMeetingLiveTranscriptHandle | null>(null);
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );
  const hasLocalScreenShare = tracks.some(
    (track) => track.source === Track.Source.ScreenShare && track.participant.isLocal,
  );
  const hasRemoteScreenShare = tracks.some(
    (track) => track.source === Track.Source.ScreenShare && !track.participant.isLocal,
  );

  useEffect(() => {
    if (shouldReturnToMeetingForLocalScreenShare(viewMode, hasLocalScreenShare)) {
      onViewModeChange("meeting");
    }
  }, [hasLocalScreenShare, onViewModeChange, viewMode]);

  async function handleEndConfirm(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    await liveTranscriptRef.current?.flush();
    const ended = await runEndMeeting(onEndMeeting);
    if (ended) {
      setEndConfirmOpen(false);
    }
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-white/10 border-b px-4 py-3">
        <div>
          <h1 className="font-medium text-xl text-white tracking-normal">{title}</h1>
          <p className="text-white/60 text-xs">{participantName}</p>
        </div>
        <div className="flex items-center gap-2">
          <RecordingStatusBadge status={recordingStatus} />
          <Badge variant="inverse">
            <IconUsers data-icon="inline-start" />
            {participants.length}
          </Badge>
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-3 p-3",
          "auto-rows-fr overflow-hidden",
          viewMode !== "meeting" && "hidden",
          tracks.length <= 1 && "grid-cols-1",
          tracks.length > 1 && tracks.length <= 4 && "grid-cols-1 md:grid-cols-2",
          tracks.length > 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        <TrackLoop tracks={tracks}>
          <HumanParticipantTile />
        </TrackLoop>
      </div>

      {inviteToken ? (
        <div
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden",
            viewMode !== "materials" && "hidden",
          )}
        >
          {hasRemoteScreenShare ? (
            <button
              className="absolute top-3 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-sky-300/40 bg-sky-500 px-4 py-2 font-medium text-sm text-white shadow-lg transition hover:bg-sky-400"
              onClick={() => onViewModeChange("meeting")}
              type="button"
            >
              <IconDeviceDesktopUp className="size-4" />
              正在共享屏幕 · 返回会议
            </button>
          ) : null}
          <InterviewerCandidateMaterials
            active={viewMode === "materials"}
            inviteToken={inviteToken}
            onStateChange={onCandidateMaterialsStateChange}
            state={candidateMaterialsState}
          />
        </div>
      ) : null}

      {inviteToken ? (
        <div
          className={cn(
            "relative min-h-0 flex-1 overflow-hidden",
            viewMode !== "review" && "hidden",
          )}
        >
          <HumanMeetingReview active={viewMode === "review"} inviteToken={inviteToken} />
        </div>
      ) : null}

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-white/10 border-t px-4 py-3">
        {canPublish ? (
          <>
            <TrackToggle
              className={mediaToggleButtonClass}
              showIcon={false}
              source={Track.Source.Microphone}
            >
              <IconMicrophone className="toggle-on size-4" />
              <IconMicrophoneOff className="toggle-off size-4" />
              <span className="toggle-on">麦克风</span>
              <span className="toggle-off">已静音</span>
            </TrackToggle>
            <MicrophoneDeviceMenu />
            {canUseVoiceEffects ? <VoiceEffectMenu /> : null}
            <TrackToggle
              className={mediaToggleButtonClass}
              showIcon={false}
              source={Track.Source.Camera}
            >
              <IconVideo className="toggle-on size-4" />
              <IconVideoOff className="toggle-off size-4" />
              <span className="toggle-on">摄像头</span>
              <span className="toggle-off">摄像头已关</span>
            </TrackToggle>
            <TrackToggle
              className={humanMeetingControlButtonClass}
              showIcon={false}
              source={Track.Source.ScreenShare}
            >
              <IconDeviceDesktopUp className="size-4" />
              共享屏幕
            </TrackToggle>
          </>
        ) : null}
        {inviteToken ? (
          <button
            className={humanMeetingControlButtonClass}
            onClick={() => onViewModeChange(viewMode === "materials" ? "meeting" : "materials")}
            type="button"
          >
            {viewMode === "materials" ? (
              <IconVideo className="size-4" />
            ) : (
              <IconFileDescription className="size-4" />
            )}
            {viewMode === "materials" ? "切换到会议" : "切换到候选人资料"}
          </button>
        ) : null}
        {inviteToken ? (
          <button
            className={humanMeetingControlButtonClass}
            onClick={() => onViewModeChange(viewMode === "review" ? "meeting" : "review")}
            type="button"
          >
            {viewMode === "review" ? (
              <IconVideo className="size-4" />
            ) : (
              <IconChecklist className="size-4" />
            )}
            {viewMode === "review" ? "切换到会议" : "会议复核"}
          </button>
        ) : null}
        {canEndMeeting ? (
          <button
            className={endButtonClass}
            disabled={isEnding}
            onClick={() => setEndConfirmOpen(true)}
            type="button"
          >
            {isEnding ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconPlayerStop className="size-4" />
            )}
            {isEnding ? "结束中…" : "结束会议"}
          </button>
        ) : null}
        <DisconnectButton className={leaveButtonClass}>
          <IconPhoneOff className="size-4" />
          离开
        </DisconnectButton>
      </footer>
      {inviteToken && canUseLiveTranscript ? (
        <HumanMeetingLiveTranscript inviteToken={inviteToken} ref={liveTranscriptRef} />
      ) : null}
      <AlertDialog onOpenChange={setEndConfirmOpen} open={endConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>结束这场会议？</AlertDialogTitle>
            <AlertDialogDescription>
              结束后会关闭当前视频房间，所有已加入的人都会离开，后续也不能继续进入该会议。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isEnding}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={isEnding} onClick={handleEndConfirm} variant="destructive">
              {isEnding ? <IconLoader2 className="size-4 animate-spin" /> : null}
              确认结束
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecordingStatusBadge({ status }: { status: HumanInterviewRecordingStatus }) {
  if (status === "pending") {
    return null;
  }
  const label = {
    active: "录音中",
    completed: "录音已保存",
    failed: "录音异常",
    starting: "正在启动录音",
  }[status];
  return (
    <Badge variant={status === "failed" ? "destructive" : "inverse"}>
      <IconPointFilled
        className={cn("size-3", status === "active" && "animate-pulse text-red-400")}
        data-icon="inline-start"
      />
      {label}
    </Badge>
  );
}

function HumanParticipantTile() {
  const trackRef = useTrackRefContext();
  const badge = getParticipantBadge(trackRef);

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
      <ParticipantTile
        className={cn(
          "relative h-full min-h-0 w-full overflow-hidden bg-zinc-900",
          "[&_.lk-focus-toggle-button]:hidden",
          "[&_.lk-participant-metadata]:absolute [&_.lk-participant-metadata]:right-3 [&_.lk-participant-metadata]:bottom-3 [&_.lk-participant-metadata]:left-3",
          "[&_.lk-participant-metadata]:flex [&_.lk-participant-metadata]:items-center [&_.lk-participant-metadata]:justify-between",
          "[&_.lk-participant-metadata-item]:rounded-md [&_.lk-participant-metadata-item]:bg-black/55 [&_.lk-participant-metadata-item]:px-2 [&_.lk-participant-metadata-item]:py-1",
          "[&_.lk-participant-placeholder]:absolute [&_.lk-participant-placeholder]:inset-0 [&_.lk-participant-placeholder]:grid [&_.lk-participant-placeholder]:place-items-center [&_.lk-participant-placeholder]:bg-zinc-900",
          "[&_.lk-participant-placeholder_svg]:size-16 [&_.lk-participant-placeholder_svg]:text-white/25",
          "[&_video]:relative [&_video]:z-10 [&_video]:h-full [&_video]:w-full [&_video]:object-cover",
        )}
        trackRef={trackRef}
      />
      <Badge
        className="pointer-events-none absolute top-3 left-3 z-20 max-w-[calc(100%-1.5rem)] truncate shadow-sm backdrop-blur"
        title={badge.label}
        variant={badge.tone === "candidate" ? "info" : "inverse"}
      >
        {badge.label}
      </Badge>
    </div>
  );
}

export const humanMeetingControlButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm text-white transition hover:bg-white/15";

const mediaToggleButtonClass = `${humanMeetingControlButtonClass} [&[data-lk-enabled='true']_.toggle-off]:hidden [&[data-lk-enabled='false']_.toggle-on]:hidden`;

const leaveButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-red-400/40 bg-red-500 px-3 text-sm text-white transition hover:bg-red-500/90";

const endButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-amber-300/40 bg-amber-500 px-3 text-sm text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60";
