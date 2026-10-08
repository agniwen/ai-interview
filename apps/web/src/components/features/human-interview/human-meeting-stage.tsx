"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { ButtonGroup } from "@/components/ui/button-group";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/* oxlint-disable no-use-before-define -- exported stage stays above local tile and style helpers. */

import {
  IconSubtitles,
  IconDeviceDesktopUp,
  IconFileDescription,
  IconLoader2,
  IconMessageCircle,
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
  useIsSpeaking,
  useTrackRefContext,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  meetingCameraCaptureOptions,
  meetingScreenShareCaptureOptions,
} from "./human-meeting-video-quality";
import { notifyMeetingMediaError } from "./human-meeting-media-errors";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { HumanMeetingChat } from "./human-meeting-chat";
import { HumanMeetingTranscriptPanel } from "./human-meeting-transcript-panel";
import { MeetingInfoHoverCard } from "./meeting-info-hover-card";
import type { HumanMeetingLiveTranscriptHandle } from "./human-meeting-live-transcript";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

const participantMetadataSchema = z.object({
  avatar_url: z.string().nullable().optional(),
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
  responsibleHrImage?: string | null;
  responsibleHrName?: string | null;
  scheduledAt?: string | null;
  canPublish: boolean;
  canUseVoiceEffects: boolean;
  canUseLiveTranscript: boolean;
  canEndMeeting: boolean;
  candidateMaterialsState: InterviewerCandidateMaterialsState;
  chatInviteToken: string;
  chatMode: "candidate" | "interviewer";
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
  responsibleHrImage,
  responsibleHrName,
  scheduledAt,
  canPublish,
  // canUseVoiceEffects,
  canUseLiveTranscript,
  canEndMeeting,
  candidateMaterialsState,
  chatInviteToken,
  chatMode,
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
  const [chatOpen, setChatOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const closeTranscript = useCallback(() => setTranscriptOpen(false), []);
  const toggleChat = () => {
    setTranscriptOpen(false);
    setChatOpen((value) => !value);
  };
  const renderTranscriptPanel = useCallback(
    (panel: ReactNode) => (
      <HumanMeetingTranscriptPanel open={transcriptOpen} onClose={closeTranscript}>
        {panel}
      </HumanMeetingTranscriptPanel>
    ),
    [closeTranscript, transcriptOpen],
  );
  const [headerActionsContainer, setHeaderActionsContainer] = useState<HTMLDivElement | null>(null);
  const closeChat = useCallback(() => setChatOpen(false), []);
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
      <header className="flex h-11 shrink-0 items-center gap-2 pr-1.5 pl-3 md:h-12 md:pl-4">
        <div className="flex min-w-0 flex-1 items-center">
          <h1 className="flex min-w-0 items-center">
            <MeetingInfoHoverCard
              jobDescriptionName={jobDescriptionName}
              meetingTitle={title}
              responsibleHrImage={responsibleHrImage}
              responsibleHrName={responsibleHrName}
              roundLabel={roundLabel}
              scheduledAt={scheduledAt}
              showResponsibleHr={chatMode === "interviewer"}
            />
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:min-w-0 md:flex-1 md:justify-end">
          {inviteToken ? (
            <div
              ref={setHeaderActionsContainer}
              data-slot="meeting-materials-actions"
              className={cn("flex shrink-0", viewMode !== "materials" && "hidden")}
            />
          ) : null}
          {inviteToken && canUseLiveTranscript ? (
            <Button
              aria-label="字幕"
              aria-expanded={transcriptOpen}
              data-slot="meeting-transcript-toggle"
              className="max-md:[&_svg]:size-5"
              onClick={() => {
                setChatOpen(false);
                setTranscriptOpen((value) => !value);
              }}
              size="sm"
              variant={transcriptOpen ? "secondary" : "ghost"}
            >
              <IconSubtitles data-icon="inline-start" />
              字幕
            </Button>
          ) : null}
          {isRecording ? (
            <output
              className="hidden items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs md:inline-flex"
              data-slot="meeting-recording-status"
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-destructive" />
              录制中
            </output>
          ) : null}
          <ThemeToggle className="hidden shrink-0 md:inline-flex" />
          <Badge
            className="hidden h-8 gap-1.5 rounded-md px-2.5 py-0 md:inline-flex"
            variant="secondary"
            aria-label="参会人数"
          >
            <IconUsers data-icon="inline-start" />
            {participants.length}
          </Badge>
          <Button
            aria-expanded={chatOpen}
            aria-label={chatOpen ? "关闭聊天" : "打开聊天"}
            className="md:hidden [&_svg]:size-5"
            onClick={toggleChat}
            size="icon-sm"
            variant="secondary"
          >
            <IconMessageCircle />
          </Button>
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
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-2 md:bottom-6">
                  <Button
                    className="pointer-events-auto shadow-sm"
                    onClick={() => onViewModeChange("meeting")}
                    size="sm"
                    variant="secondary"
                  >
                    <IconDeviceDesktopUp className="size-4" />
                    正在共享屏幕 · 返回会议
                  </Button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <InterviewerCandidateMaterials
                  showQuestions
                  active={viewMode === "materials"}
                  headerActionsContainer={headerActionsContainer}
                  inviteToken={inviteToken}
                  onStateChange={onCandidateMaterialsStateChange}
                  state={candidateMaterialsState}
                />
              </div>
            </div>
          ) : null}
        </div>
        <HumanMeetingChat
          access={{ inviteToken: chatInviteToken, mode: chatMode }}
          open={chatOpen}
          onClose={closeChat}
        />
        {inviteToken && canUseLiveTranscript ? (
          <HumanMeetingLiveTranscript
            candidateName={candidateName}
            inviteToken={inviteToken}
            ref={liveTranscriptRef}
            renderPanel={renderTranscriptPanel}
          />
        ) : null}
      </div>

      <footer
        className={cn(
          "relative flex shrink-0 flex-wrap items-center justify-center gap-1 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:gap-2 md:px-4 md:pt-3 md:pb-3",
          viewMode === "meeting" && "pt-0 md:pt-1.5",
        )}
      >
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
              captureOptions={meetingCameraCaptureOptions}
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
              captureOptions={meetingScreenShareCaptureOptions}
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
            <span>{viewMode === "materials" ? "会议视图" : "候选人信息"}</span>
          </button>
        ) : null}
        <button
          aria-expanded={chatOpen}
          aria-label={chatOpen ? "关闭聊天" : "打开聊天"}
          className={cn(
            humanMeetingControlButtonClass,
            "hidden md:inline-flex",
            chatOpen && "bg-accent",
          )}
          onClick={toggleChat}
          type="button"
        >
          <IconMessageCircle className="size-4" />
          <span>聊天</span>
        </button>
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
            className="hidden md:inline-flex"
            variant="destructive"
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

function InterviewerPlaceholderAvatar({ image, name }: { image: string; name: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      data-slot="interviewer-placeholder-avatar"
      className={cn(
        "pointer-events-none absolute inset-0 z-[5] grid place-items-center transition-opacity duration-200",
        loaded ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="relative grid size-28 place-items-center">
        {/* oxlint-disable-next-line next/no-img-element -- TanStack Start has no Next image runtime; this decorative layer reuses the participant avatar URL. */}
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className="absolute size-32 scale-125 rounded-full object-cover opacity-25 blur-2xl"
        />
        {/* oxlint-disable-next-line next/no-img-element -- Native image load/error events control when the participant placeholder becomes visible. */}
        <img
          src={image}
          alt={`${name}的头像`}
          className="relative size-24 rounded-full bg-muted object-cover shadow-lg"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      </div>
    </div>
  );
}

function HumanParticipantTile({
  onFocusTrack,
  onResetFocus,
}: {
  onFocusTrack?: (key: string) => void;
  onResetFocus?: () => void;
}) {
  const trackRef = useTrackRefContext();
  const isSpeaking = useIsSpeaking(trackRef.participant);
  const highlightSpeaker = isSpeaking && trackRef.source === Track.Source.Camera;
  const roleLabel = getParticipantRoleLabel(trackRef);
  const metadata = parseParticipantMetadata(trackRef.participant.metadata);
  const interviewerImage =
    metadata.participant_type === "interviewer" && trackRef.source === Track.Source.Camera
      ? metadata.avatar_url?.trim()
      : null;

  return (
    <div
      data-speaking={highlightSpeaker}
      className={cn(
        "relative isolate h-full min-h-0 overflow-hidden rounded-sm border bg-muted/40 transition-colors duration-200 dark:bg-muted",
        highlightSpeaker
          ? "border-emerald-500 dark:border-emerald-400"
          : "border-border/50 dark:border-border",
      )}
    >
      <ParticipantTile
        className={cn(
          "relative h-full min-h-0 w-full overflow-hidden bg-transparent!",
          "[&_.lk-focus-toggle-button]:hidden",
          "[&_.lk-participant-metadata]:hidden",
          "[&_.lk-participant-placeholder]:absolute [&_.lk-participant-placeholder]:inset-0 [&_.lk-participant-placeholder]:grid [&_.lk-participant-placeholder]:place-items-center [&_.lk-participant-placeholder]:bg-transparent!",
          "[&_.lk-participant-placeholder_svg]:size-16 [&_.lk-participant-placeholder_svg]:text-muted-foreground [&_.lk-participant-placeholder_path]:fill-current [&_.lk-participant-placeholder_path]:[fill-opacity:1]",
          "[&_video]:relative [&_video]:z-10 [&_video]:h-full [&_video]:w-full",
          trackRef.source === Track.Source.ScreenShare
            ? "[&_video]:object-contain"
            : "[&_video]:object-cover",
        )}
        trackRef={trackRef}
      />
      {interviewerImage ? (
        <InterviewerPlaceholderAvatar
          key={interviewerImage}
          image={interviewerImage}
          name={trackRef.participant.name || "面试官"}
        />
      ) : null}
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
