"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/* oxlint-disable no-use-before-define -- exported stage stays above local tile and style helpers. */

import {
  IconDeviceDesktopUp,
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
  IconFileDescription,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconPlayerStopFilled,
  IconUsers,
  IconUserFilled,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
import {
  DisconnectButton,
  ConnectionQualityIndicator,
  ParticipantName,
  TrackMutedIndicator,
  FocusLayoutContainer,
  ParticipantTile,
  StartAudio,
  TrackLoop,
  TrackToggle,
  useParticipants,
  useTrackRefContext,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { notifyMeetingMediaError } from "./human-meeting-media-errors";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { cn } from "@app/shared/utils";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { MicrophoneDeviceMenu } from "./human-meeting-audio-controls";
// import { VoiceEffectMenu } from "./human-meeting-audio-controls";
import { shouldReturnToMeetingForLocalScreenShare } from "./human-meeting-materials-model";
import type { HumanMeetingViewMode } from "./human-meeting-materials-model";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";
import { HumanMeetingLiveTranscript } from "./human-meeting-live-transcript";
import type { HumanMeetingLiveTranscriptHandle } from "./human-meeting-live-transcript";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

const participantMetadataSchema = z.object({
  participant_role: z.string().optional(),
  participant_type: z.string().optional(),
});

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

function getParticipantRoleLabel(trackRef: TrackReferenceOrPlaceholder): string {
  const metadata = parseParticipantMetadata(trackRef.participant.metadata);
  const { identity } = trackRef.participant;
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
  return roleLabel;
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
  candidateName?: string;
  jobDescriptionName?: string | null;
  roundLabel?: string;
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
  title: string;
  viewMode: HumanMeetingViewMode;
}

// oxlint-disable-next-line complexity -- stage rendering reflects the approved meeting, materials, and sharing modes.
export function HumanMeetingStage({
  candidateName,
  jobDescriptionName,
  roundLabel,
  canPublish,
  // canUseVoiceEffects,
  canUseLiveTranscript,
  canEndMeeting,
  candidateMaterialsState,
  inviteToken,
  isEnding,
  onCandidateMaterialsStateChange,
  onEndMeeting,
  onViewModeChange,
  title,
  viewMode,
}: HumanMeetingStageProps) {
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [focusedTrackKey, setFocusedTrackKey] = useState<string | null>(null);
  const liveTranscriptRef = useRef<HumanMeetingLiveTranscriptHandle | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  const transcriptToggle = (
    <Button
      data-slot="meeting-transcript-toggle"
      className={cn(
        "absolute top-24 z-20 h-auto flex-col gap-2 bg-background px-2 py-3 shadow-sm",
        transcriptExpanded
          ? "left-0 rounded-l-none border-l-0"
          : "right-0 rounded-r-none border-r-0",
      )}
      variant="outline"
      aria-label={transcriptExpanded ? "收起实时转录" : "展开实时转录"}
      aria-expanded={transcriptExpanded}
      aria-controls="human-meeting-transcript-panel"
      onClick={() => setTranscriptExpanded((expanded) => !expanded)}
    >
      {transcriptExpanded ? (
        <IconChevronRight className="size-4" />
      ) : (
        <IconChevronLeft className="size-4" />
      )}
      <span className="text-xs [writing-mode:vertical-rl]">实时转录</span>
    </Button>
  );

  function renderTranscriptPanel(panel: ReactNode) {
    return (
      <div
        id="human-meeting-transcript-panel"
        data-slot="meeting-transcript-panel"
        hidden={!transcriptExpanded}
        className={cn(
          "relative min-h-0 min-w-0 flex-col overflow-hidden border-border border-t bg-background pl-8 lg:border-t-0 lg:border-l",
          transcriptExpanded ? "flex" : "hidden",
        )}
      >
        <div className="shrink-0 border-border border-b px-3 py-2">
          <span className="text-sm font-medium">实时转录</span>
        </div>
        {panel}
        {transcriptExpanded ? transcriptToggle : null}
      </div>
    );
  }
  const participants = useParticipants().filter((participant) => !participant.isAgent);
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  ).filter((track) => !track.participant.isAgent);
  const manuallyFocusedTrack = tracks.find(
    (track) => getMeetingTrackKey(track) === focusedTrackKey,
  );
  const focusedTrack =
    manuallyFocusedTrack ?? tracks.find((track) => track.source === Track.Source.ScreenShare);
  const sideTracks = tracks.filter((track) => track !== focusedTrack);

  if (focusedTrackKey && !manuallyFocusedTrack) {
    setFocusedTrackKey(null);
  }
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
      <header className="flex shrink-0 items-center justify-between gap-2 border-border border-b px-4 py-2 md:gap-3 md:py-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-medium text-sm leading-5 text-foreground tracking-normal md:text-xl">
            <span className="block truncate md:hidden">
              {[candidateName, jobDescriptionName].filter(Boolean).join("－") || title}
            </span>
            <span className="hidden md:block">{title}</span>
          </h1>
          {roundLabel ? (
            <p className="truncate text-xs leading-4 text-muted-foreground md:hidden">
              {roundLabel}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" aria-label="参会人数">
            <IconUsers data-icon="inline-start" />
            {participants.length}
          </Badge>
          <ThemeToggle className="shrink-0" />
        </div>
      </header>

      <div
        data-slot="meeting-workspace"
        className={cn(
          "relative grid min-h-0 flex-1 overflow-hidden",
          inviteToken &&
            canUseLiveTranscript &&
            transcriptExpanded &&
            "grid-rows-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-cols-[minmax(0,1fr)_clamp(21.75rem,25vw,25.75rem)] lg:grid-rows-1",
        )}
      >
        <div
          data-slot="meeting-main-panels"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        >
          {focusedTrack ? (
            <FocusLayoutContainer
              data-slot="meeting-share-layout"
              className={cn(
                "grid min-h-0 min-w-0 flex-1 gap-3 overflow-hidden p-3",
                sideTracks.length > 0
                  ? "grid-rows-[minmax(0,1fr)_8rem] md:grid-cols-[minmax(0,1fr)_clamp(9rem,18vw,13rem)] md:grid-rows-1"
                  : "grid-cols-1 grid-rows-1",
                viewMode !== "meeting" && "hidden",
              )}
            >
              <div data-slot="meeting-share-main" className="min-h-0 min-w-0">
                <TrackLoop tracks={[focusedTrack]}>
                  <HumanParticipantTile
                    onResetFocus={manuallyFocusedTrack ? () => setFocusedTrackKey(null) : undefined}
                  />
                </TrackLoop>
              </div>
              {sideTracks.length > 0 ? (
                <aside
                  aria-label="其他参会画面"
                  data-slot="meeting-share-sidebar"
                  className="grid min-h-0 min-w-0 auto-cols-[12rem] grid-flow-col gap-3 overflow-x-auto md:auto-cols-auto md:auto-rows-[8rem] md:grid-flow-row md:content-start md:overflow-x-hidden md:overflow-y-auto"
                >
                  <TrackLoop tracks={sideTracks}>
                    <HumanParticipantTile onFocusTrack={setFocusedTrackKey} />
                  </TrackLoop>
                </aside>
              ) : null}
            </FocusLayoutContainer>
          ) : (
            <div
              data-slot="meeting-grid-layout"
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
                <HumanParticipantTile onFocusTrack={setFocusedTrackKey} />
              </TrackLoop>
            </div>
          )}

          {inviteToken ? (
            <div
              className={cn(
                "relative flex min-h-0 flex-1 flex-col overflow-hidden",
                viewMode !== "materials" && "hidden",
              )}
            >
              <div className="min-h-0 flex-1">
                <InterviewerCandidateMaterials
                  active={viewMode === "materials"}
                  inviteToken={inviteToken}
                  onStateChange={onCandidateMaterialsStateChange}
                  state={candidateMaterialsState}
                />
              </div>
            </div>
          ) : null}
        </div>
        {inviteToken && canUseLiveTranscript ? (
          <HumanMeetingLiveTranscript
            candidateName={candidateName}
            inviteToken={inviteToken}
            ref={liveTranscriptRef}
            renderPanel={renderTranscriptPanel}
          />
        ) : null}
        {inviteToken && canUseLiveTranscript && !transcriptExpanded ? transcriptToggle : null}
      </div>

      <footer className="relative flex shrink-0 flex-wrap items-center justify-center gap-1 border-border border-t px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:gap-2 md:px-4 md:py-3">
        {inviteToken && viewMode === "materials" && hasRemoteScreenShare ? (
          <button
            className="absolute bottom-full left-1/2 z-30 mb-2 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-primary-border bg-primary px-4 py-2 font-medium text-sm text-primary-foreground shadow-lg transition hover:bg-primary/90"
            onClick={() => onViewModeChange("meeting")}
            type="button"
          >
            <IconDeviceDesktopUp className="size-4" />
            正在共享屏幕 · 返回会议
          </button>
        ) : null}
        <StartAudio className={buttonVariants({ variant: "default" })} label="开启声音" />
        {canPublish ? (
          <>
            <TrackToggle
              className={cn(mediaToggleButtonClass, mobileControlClass, "order-2 md:order-none")}
              showIcon={false}
              source={Track.Source.Microphone}
              onDeviceError={notifyMeetingMediaError}
            >
              <IconMicrophone className="toggle-on size-4" />
              <IconMicrophoneOff className="toggle-off size-4" />
              <span className="toggle-on">麦克风</span>
              <span className="toggle-off">
                <span className="md:hidden">麦克风</span>
                <span className="hidden md:inline">已静音</span>
              </span>
            </TrackToggle>
            <MicrophoneDeviceMenu
              className={cn(mobileControlClass, "order-3 md:order-none")}
              compactMobile
            />
            {/* 暂时隐藏变声入口，保留实现以便恢复。 */}
            {/* {canUseVoiceEffects ? <VoiceEffectMenu /> : null} */}
            <TrackToggle
              className={cn(mediaToggleButtonClass, mobileControlClass, "order-1 md:order-none")}
              showIcon={false}
              source={Track.Source.Camera}
              onDeviceError={notifyMeetingMediaError}
            >
              <IconVideo className="toggle-on size-4" />
              <IconVideoOff className="toggle-off size-4" />
              <span className="toggle-on">摄像头</span>
              <span className="toggle-off">
                <span className="md:hidden">摄像头</span>
                <span className="hidden md:inline">摄像头已关</span>
              </span>
            </TrackToggle>
            <TrackToggle
              className={cn(
                humanMeetingControlButtonClass,
                mobileControlClass,
                "order-4 md:order-none",
                inviteToken && "hidden md:inline-flex",
              )}
              showIcon={false}
              source={Track.Source.ScreenShare}
              onDeviceError={notifyMeetingMediaError}
            >
              <IconDeviceDesktopUp className="size-4" />
              共享屏幕
            </TrackToggle>
          </>
        ) : null}
        {inviteToken ? (
          <button
            className={cn(
              humanMeetingControlButtonClass,
              mobileControlClass,
              "order-5 md:order-none",
            )}
            onClick={() => onViewModeChange(viewMode === "materials" ? "meeting" : "materials")}
            type="button"
          >
            {viewMode === "materials" ? (
              <IconVideo className="size-4" />
            ) : (
              <IconFileDescription className="size-4" />
            )}
            <span>{viewMode === "materials" ? "切换到视频" : "切换到信息"}</span>
          </button>
        ) : null}
        {inviteToken && canUseLiveTranscript ? (
          <button
            className={cn(
              humanMeetingControlButtonClass,
              mobileControlClass,
              "order-6 md:order-none",
            )}
            aria-expanded={transcriptExpanded}
            aria-controls="human-meeting-transcript-panel"
            onClick={() => setTranscriptExpanded((expanded) => !expanded)}
            type="button"
          >
            <IconMessage className="size-4" />
            <span>{transcriptExpanded ? "收起实时转录" : "展开实时转录"}</span>
          </button>
        ) : null}
        {canEndMeeting ? (
          <button
            className={cn(endButtonClass, mobileControlClass, "order-7 md:order-none")}
            disabled={isEnding}
            onClick={() => setEndConfirmOpen(true)}
            type="button"
          >
            {isEnding ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconPlayerStopFilled className="size-4" />
            )}
            {isEnding ? "结束中…" : "结束会议"}
          </button>
        ) : (
          <DisconnectButton
            className={cn(leaveButtonClass, mobileControlClass, "order-7 md:order-none")}
          >
            <IconPhoneOff className="size-4" />
            <span className="md:hidden">退出</span>
            <span className="hidden md:inline">离开</span>
          </DisconnectButton>
        )}
      </footer>
      <Modal
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="结束这场会议？"
        description="结束后会关闭当前视频房间，所有已加入的人都会离开，后续也不能继续进入该会议。"
        size="sm"
        dismissible={!isEnding}
        showCloseButton={!isEnding}
        bodyClassName="hidden"
        footer={
          <>
            <Button
              className="max-md:h-12 max-md:min-w-36 max-md:px-6"
              variant="outline"
              disabled={isEnding}
              onClick={() => setEndConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              className="max-md:h-12 max-md:min-w-36 max-md:px-6"
              disabled={isEnding}
              onClick={handleEndConfirm}
              variant="destructive"
            >
              {isEnding ? <IconLoader2 className="size-4 animate-spin" /> : null}
              {isEnding ? "结束中…" : "确认结束"}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
    </div>
  );
}

function getMeetingTrackKey(track: TrackReferenceOrPlaceholder) {
  return JSON.stringify([track.participant.identity, track.source]);
}

function HumanParticipantTile({
  onFocusTrack,
  onResetFocus,
}: {
  onFocusTrack?: (key: string) => void;
  onResetFocus?: () => void;
}) {
  const trackRef = useTrackRefContext();
  const roleLabel = getParticipantRoleLabel(trackRef);

  return (
    <div className="relative isolate h-full min-h-0 overflow-hidden rounded-lg border border-border bg-muted">
      <ParticipantTile
        className={cn(
          "relative h-full min-h-0 w-full overflow-hidden bg-muted",
          "[&_.lk-focus-toggle-button]:hidden",
          "[&_.lk-participant-metadata]:hidden",
          "[&_.lk-participant-placeholder]:absolute [&_.lk-participant-placeholder]:inset-0 [&_.lk-participant-placeholder]:grid [&_.lk-participant-placeholder]:place-items-center [&_.lk-participant-placeholder]:bg-muted",
          "[&_.lk-participant-placeholder_svg]:size-16 [&_.lk-participant-placeholder_svg]:text-muted-foreground [&_.lk-participant-placeholder_path]:fill-current [&_.lk-participant-placeholder_path]:[fill-opacity:1]",
          "[&_video]:relative [&_video]:z-10 [&_video]:h-full [&_video]:w-full",
          trackRef.source === Track.Source.ScreenShare
            ? "[&_video]:object-contain"
            : "[&_video]:object-cover",
        )}
        trackRef={trackRef}
      />
      {onFocusTrack ? (
        <button
          type="button"
          aria-label={`将${trackRef.participant.name || trackRef.participant.identity}的${trackRef.source === Track.Source.ScreenShare ? "共享屏幕" : "摄像头"}设为主画面`}
          title="设为主画面"
          className="absolute inset-0 z-30 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onClick={() => onFocusTrack(getMeetingTrackKey(trackRef))}
        />
      ) : null}
      {onResetFocus ? (
        <button
          type="button"
          className={cn(
            buttonVariants({ size: "sm", variant: "secondary" }),
            "absolute top-3 right-3 z-30",
          )}
          onClick={onResetFocus}
        >
          自动布局
        </button>
      ) : null}
      <div
        data-slot="participant-details"
        className="pointer-events-none absolute right-3 bottom-3 left-3 z-20 flex items-center justify-between gap-2"
      >
        <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-background px-2 py-1 text-foreground">
          {trackRef.source === Track.Source.ScreenShare ? (
            <IconDeviceDesktopUp aria-label="屏幕共享" className="size-3.5 shrink-0" />
          ) : (
            <TrackMutedIndicator
              className="flex shrink-0 [&_svg]:size-3.5"
              trackRef={{ participant: trackRef.participant, source: Track.Source.Microphone }}
              show="muted"
            />
          )}
          <ParticipantName
            participant={trackRef.participant}
            className="min-w-0 truncate text-sm"
          />
          {trackRef.participant.isLocal ? (
            <IconUserFilled
              aria-label="当前用户"
              className="size-3 shrink-0 text-muted-foreground"
            />
          ) : null}
          <span className="shrink-0 text-muted-foreground text-[10px]">{roleLabel}</span>
        </div>
        <ConnectionQualityIndicator
          participant={trackRef.participant}
          className="shrink-0 rounded-md bg-background px-2 py-1 text-foreground [&_svg]:size-4"
        />
      </div>
    </div>
  );
}

export const humanMeetingControlButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-foreground transition hover:bg-accent";

const mediaToggleButtonClass = `${humanMeetingControlButtonClass} [&[data-lk-enabled='true']_.toggle-off]:hidden [&[data-lk-enabled='false']_.toggle-on]:hidden`;

const leaveButtonClass = buttonVariants({ variant: "destructive" });

const endButtonClass = buttonVariants({ variant: "destructive" });

const mobileControlClass =
  "max-md:h-12 max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:text-[10px] max-md:whitespace-nowrap";
