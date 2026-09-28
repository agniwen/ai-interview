"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/* oxlint-disable no-use-before-define -- exported stage stays above local tile and style helpers. */

import {
  IconDeviceDesktopUp,
  IconFileDescription,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconPlayerStopFilled,
  IconUsers,
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
  useIsRecording,
  useTrackRefContext,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { notifyMeetingMediaError } from "./human-meeting-media-errors";
import type { MouseEvent } from "react";
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

// Keep capture, reconnection and draft persistence mounted without rendering transcript text.
function hideTranscriptPanel() {
  return null;
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
  const isMobile = useIsMobile();
  const MicrophoneControls = isMobile ? "fieldset" : ButtonGroup;
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [focusedTrackKey, setFocusedTrackKey] = useState<string | null>(null);
  const liveTranscriptRef = useRef<HumanMeetingLiveTranscriptHandle | null>(null);
  const isRecording = useIsRecording();
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
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 pr-1.5 pl-3 md:h-10 md:pl-4">
        <div className="min-w-0 flex-1">
          <h1
            className="truncate font-medium text-sm leading-5 text-foreground tracking-normal"
            title={title}
          >
            <span className="block truncate md:hidden">
              {[candidateName, jobDescriptionName, roundLabel].filter(Boolean).join(" · ") || title}
            </span>
            <span className="hidden truncate md:block">{title}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isRecording ? (
            <output
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs"
              data-slot="meeting-recording-status"
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-destructive" />
              录制中
            </output>
          ) : null}
          <Badge className="hidden md:inline-flex" variant="secondary" aria-label="参会人数">
            <IconUsers data-icon="inline-start" />
            {participants.length}
          </Badge>
          <ThemeToggle className="hidden shrink-0 md:inline-flex" />
          {canEndMeeting ? (
            <Button
              aria-label="结束会议"
              className={mobileHangupButtonClass}
              disabled={isEnding}
              onClick={() => setEndConfirmOpen(true)}
              size="icon-sm"
              variant="destructive"
            >
              {isEnding ? <IconLoader2 className="size-4 animate-spin" /> : <HangUpIcon />}
            </Button>
          ) : (
            <Button
              onClick={() => setLeaveConfirmOpen(true)}
              aria-label="退出会议"
              title="退出会议"
              className={mobileHangupButtonClass}
              size="icon-sm"
              variant="destructive"
            >
              <HangUpIcon />
            </Button>
          )}
        </div>
      </header>

      <div data-slot="meeting-workspace" className="relative grid min-h-0 flex-1 overflow-hidden">
        <div
          data-slot="meeting-main-panels"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
        >
          {focusedTrack ? (
            <FocusLayoutContainer
              data-slot="meeting-share-layout"
              className={cn(
                "grid min-h-0 min-w-0 flex-1 gap-1.5 overflow-hidden px-1.5 pb-1.5",
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
                  className="grid min-h-0 min-w-0 auto-cols-[12rem] grid-flow-col gap-1.5 overflow-x-auto md:auto-cols-auto md:auto-rows-[8rem] md:grid-flow-row md:content-start md:overflow-x-hidden md:overflow-y-auto"
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
                "grid min-h-0 flex-1 gap-1.5 px-1.5 pb-1.5",
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
              {viewMode === "materials" && hasRemoteScreenShare ? (
                <div className="flex shrink-0 justify-center px-2 pt-1.5 md:px-3">
                  <Button onClick={() => onViewModeChange("meeting")} size="sm" variant="secondary">
                    <IconDeviceDesktopUp className="size-4" />
                    正在共享屏幕 · 返回会议
                  </Button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <InterviewerCandidateMaterials
                  showQuestions
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
            renderPanel={hideTranscriptPanel}
          />
        ) : null}
      </div>

      <footer className="relative flex shrink-0 flex-wrap items-center justify-center gap-1 border-border px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:gap-2 md:border-t md:px-4 md:py-3">
        <StartAudio className={buttonVariants({ variant: "default" })} label="开启声音" />
        {canPublish ? (
          <>
            <MicrophoneControls
              aria-label="麦克风控制"
              className="order-1 max-md:contents md:order-none"
            >
              <TrackToggle
                className={cn(mediaToggleButtonClass, mobileControlClass, "order-1 md:order-none")}
                showIcon={false}
                source={Track.Source.Microphone}
                onDeviceError={notifyMeetingMediaError}
              >
                <IconMicrophone className="toggle-on size-4" />
                <IconMicrophoneOff className="toggle-off size-4 text-destructive" />
                <span className="toggle-on">麦克风</span>
                <span className="toggle-off">
                  <span className="md:hidden">麦克风</span>
                  <span className="hidden md:inline">已静音</span>
                </span>
              </TrackToggle>
              <MicrophoneDeviceMenu />
            </MicrophoneControls>
            {/* 暂时隐藏变声入口，保留实现以便恢复。 */}
            {/* {canUseVoiceEffects ? <VoiceEffectMenu /> : null} */}
            <TrackToggle
              className={cn(mediaToggleButtonClass, mobileControlClass, "order-2 md:order-none")}
              showIcon={false}
              source={Track.Source.Camera}
              onDeviceError={notifyMeetingMediaError}
            >
              <IconVideo className="toggle-on size-4" />
              <IconVideoOff className="toggle-off size-4 text-destructive" />
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
        {canEndMeeting ? (
          <button
            className={cn(endButtonClass, "hidden md:inline-flex")}
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
          <Button
            onClick={() => setLeaveConfirmOpen(true)}
            className={cn(leaveButtonClass, "hidden md:inline-flex")}
          >
            <IconPhoneOff className="size-4" />
            <span>离开</span>
          </Button>
        )}
      </footer>
      <Modal
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title="退出会议？"
        description="退出后将断开你的音视频连接，其他参会者不受影响。"
        size="sm"
        bodyClassName="hidden"
        footer={
          <>
            <Button variant="outline" onClick={() => setLeaveConfirmOpen(false)}>
              取消
            </Button>
            <DisconnectButton className={leaveButtonClass}>确认退出</DisconnectButton>
          </>
        }
      >
        {null}
      </Modal>
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

function HangUpIcon() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 6C7.8 6 4 7.7 1.3 10.5a1.5 1.5 0 0 0 0 2.1l2.4 2.4a1.5 1.5 0 0 0 2.1 0c.7-.7 1.5-1.2 2.4-1.6a1.5 1.5 0 0 0 .8-1.3V9.8a13 13 0 0 1 6 0v2.3c0 .6.3 1.1.8 1.3.9.4 1.7.9 2.4 1.6a1.5 1.5 0 0 0 2.1 0l2.4-2.4a1.5 1.5 0 0 0 0-2.1C20 7.7 16.2 6 12 6Z" />
    </svg>
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
    <div className="relative isolate h-full min-h-0 overflow-hidden rounded-sm border border-border bg-muted">
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
          className="absolute inset-0 z-30 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onClick={() => onFocusTrack(getMeetingTrackKey(trackRef))}
        />
      ) : null}
      {onResetFocus ? (
        <button
          type="button"
          className={cn(
            buttonVariants({ size: "sm", variant: "secondary" }),
            "absolute top-2 right-2 z-30",
          )}
          onClick={onResetFocus}
        >
          自动布局
        </button>
      ) : null}
      <div
        data-slot="participant-details"
        className="pointer-events-none absolute right-2 bottom-2 left-2 z-20 flex items-center justify-between gap-2"
      >
        <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-background px-2 py-1 text-foreground">
          {trackRef.source === Track.Source.ScreenShare ? (
            <IconDeviceDesktopUp aria-label="屏幕共享" className="size-3.5 shrink-0" />
          ) : (
            <TrackMutedIndicator
              className="flex shrink-0 text-destructive [&_svg]:size-3.5"
              trackRef={{ participant: trackRef.participant, source: Track.Source.Microphone }}
              show="muted"
            />
          )}
          <ParticipantName
            participant={trackRef.participant}
            className="min-w-0 truncate text-sm"
          />
          {trackRef.participant.isLocal ? <span className="shrink-0 text-sm">(我)</span> : null}
          <span className="shrink-0 text-muted-foreground text-[10px]">{roleLabel}</span>
        </div>
        <ConnectionQualityIndicator
          participant={trackRef.participant}
          className="shrink-0 rounded-md bg-background px-2 py-1 text-warning data-[lk-quality=excellent]:text-success data-[lk-quality=poor]:text-destructive [&_svg]:size-4"
        />
      </div>
    </div>
  );
}

export const humanMeetingControlButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm text-foreground transition hover:bg-accent";

const mediaToggleButtonClass = `${humanMeetingControlButtonClass} [&[data-lk-enabled='true']_.toggle-off]:hidden [&[data-lk-enabled='false']_.toggle-on]:hidden`;

const mobileHangupButtonClass =
  "border-[#F64C47] bg-[#F64C47] text-white hover:border-[#F64C47] hover:bg-[#F64C47]/90 hover:text-white dark:bg-[#F64C47] dark:hover:bg-[#F64C47]/90 md:hidden";

const leaveButtonClass = buttonVariants({ variant: "destructive" });

const endButtonClass = buttonVariants({ variant: "destructive" });

const mobileControlClass =
  "max-md:h-11 max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:justify-center max-md:gap-1 max-md:border-0 max-md:bg-transparent max-md:px-1 max-md:text-[10px] max-md:whitespace-nowrap max-md:shadow-none max-md:hover:bg-transparent max-md:dark:bg-transparent max-md:dark:hover:bg-transparent max-md:[&_svg]:size-5";
