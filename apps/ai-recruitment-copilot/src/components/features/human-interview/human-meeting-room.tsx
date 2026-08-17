"use client";

import {
  IconDeviceDesktopUp,
  IconLoader2,
  IconLogin,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneOff,
  IconPlayerStop,
  IconUsers,
  IconVideo,
  IconVideoOff,
} from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- exported room wrapper stays above local stage helpers. */

import {
  DisconnectButton,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  TrackToggle,
  useRoomContext,
  useTrackRefContext,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";

import { ConnectionState, RoomEvent, Track } from "livekit-client";
import type { MouseEvent } from "react";
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type {
  HumanInterviewMeetingTokenResponse,
  PublicHumanInterviewInterviewerPreview,
  PublicHumanInterviewMeetingPreview,
} from "@arc/shared/studio-pipeline-stages";
import { cn } from "@arc/shared/utils";
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
import { Button } from "@/components/ui/button";
import { MicrophoneDeviceMenu, VoiceEffectMenu } from "./human-meeting-audio-controls";

type HumanMeetingRoomProps =
  | {
      inviteToken: string;
      mode: "candidate";
      preview: PublicHumanInterviewMeetingPreview;
    }
  | {
      inviteToken: string;
      mode: "interviewer";
      preview: PublicHumanInterviewInterviewerPreview;
    };

const tokenErrorPayloadSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

const humanInterviewMeetingTokenSchema = z.object({
  participantName: z.string(),
  participantRole: z.enum(["candidate", "host", "interviewer", "observer"]),
  participantToken: z.string(),
  roomName: z.string(),
  serverUrl: z.string(),
});

const participantMetadataSchema = z.object({
  participant_role: z.string().optional(),
  participant_type: z.string().optional(),
});

interface ParticipantBadge {
  label: string;
  tone: "candidate" | "interviewer";
}

async function fetchMeetingToken(path: string): Promise<HumanInterviewMeetingTokenResponse> {
  const response = await fetch(path, { method: "POST" });
  const body = await response.json().catch(() => null);
  const errorPayload = tokenErrorPayloadSchema.safeParse(body);
  if (!response.ok) {
    throw new Error(
      errorPayload.success
        ? (errorPayload.data.error ??
            errorPayload.data.message ??
            `进入会议失败（${response.status}）`)
        : `进入会议失败（${response.status}）`,
    );
  }
  const token = humanInterviewMeetingTokenSchema.safeParse(body);
  if (!token.success) {
    throw new Error("会议令牌响应无效");
  }
  return token.data;
}

function fetchCandidateToken(inviteToken: string): Promise<HumanInterviewMeetingTokenResponse> {
  return fetchMeetingToken(
    `/api/public/human-interview-meetings/${encodeURIComponent(inviteToken)}/livekit-token`,
  );
}

function fetchInterviewerToken(inviteToken: string): Promise<HumanInterviewMeetingTokenResponse> {
  return fetchMeetingToken(
    `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}/livekit-token`,
  );
}

async function endInterviewerMeeting(inviteToken: string): Promise<void> {
  const response = await fetch(
    `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}/end`,
    { method: "POST" },
  );
  const body = await response.json().catch(() => null);
  const errorPayload = tokenErrorPayloadSchema.safeParse(body);
  if (!response.ok) {
    throw new Error(
      errorPayload.success
        ? (errorPayload.data.error ??
            errorPayload.data.message ??
            `结束会议失败（${response.status}）`)
        : `结束会议失败（${response.status}）`,
    );
  }
}

const interviewerRoleLabel = {
  host: "主持人",
  interviewer: "面试官",
  observer: "旁听",
} as const;
const EARLY_JOIN_WINDOW_MS = 5 * 60 * 1000;
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "时间未定";
  }
  const value = new Date(iso);
  return dateTimeFormatter.format(value);
}

function getRoomTitle(props: HumanMeetingRoomProps): string {
  if (props.mode === "candidate") {
    return props.preview.title;
  }
  return props.preview.title;
}

function getRoomSubtitle(props: HumanMeetingRoomProps): string {
  if (props.mode === "candidate") {
    return `${props.preview.candidateName} · ${props.preview.roundLabel} · ${formatDateTime(props.preview.scheduledAt)}`;
  }
  return `${props.preview.interviewerName} · ${interviewerRoleLabel[props.preview.role]} · ${formatDateTime(props.preview.scheduledAt)}`;
}

function getScheduledStartTimestamp(
  scheduledAt: string | null,
  status: HumanMeetingRoomProps["preview"]["status"],
): number | null {
  if (status !== "scheduled" || !scheduledAt) {
    return null;
  }
  const timestamp = new Date(scheduledAt).getTime();
  return Number.isNaN(timestamp) ? null : timestamp - EARLY_JOIN_WINDOW_MS;
}

function getStartBlockMessage(
  scheduledAt: string | null,
  status: HumanMeetingRoomProps["preview"]["status"],
  nowMs: number,
): string | null {
  const timestamp = getScheduledStartTimestamp(scheduledAt, status);
  if (timestamp === null || timestamp <= nowMs) {
    return null;
  }
  return `面试时间为 ${formatDateTime(scheduledAt)}，可提前 5 分钟进入，当前暂不能进入会议。`;
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

async function loadMeetingToken(
  props: HumanMeetingRoomProps,
): Promise<
  { token: HumanInterviewMeetingTokenResponse; error: null } | { token: null; error: string }
> {
  try {
    const token =
      props.mode === "candidate"
        ? await fetchCandidateToken(props.inviteToken)
        : await fetchInterviewerToken(props.inviteToken);
    return { error: null, token };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "进入会议失败",
      token: null,
    };
  }
}

async function finishInterviewerMeeting(inviteToken: string): Promise<{ error: string | null }> {
  try {
    await endInterviewerMeeting(inviteToken);
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "结束会议失败",
    };
  }
}

async function runEndMeeting(onEndMeeting: () => Promise<void> | void): Promise<boolean> {
  try {
    await onEndMeeting();
    return true;
  } catch {
    return false;
  }
}

interface MeetingRoomState {
  isEnding: boolean;
  isJoining: boolean;
  joinError: string | null;
  token: HumanInterviewMeetingTokenResponse | null;
}

type MeetingRoomAction =
  | { type: "disconnected" }
  | { type: "endingFinished" }
  | { type: "endingStarted" }
  | { message: string; type: "joinBlocked" }
  | { message: string; type: "joinFailed" }
  | { token: HumanInterviewMeetingTokenResponse; type: "joinSucceeded" }
  | { type: "joinStarted" }
  | { message: string; type: "roomError" };

const initialMeetingRoomState: MeetingRoomState = {
  isEnding: false,
  isJoining: false,
  joinError: null,
  token: null,
};

function meetingRoomReducer(state: MeetingRoomState, action: MeetingRoomAction): MeetingRoomState {
  switch (action.type) {
    case "disconnected": {
      return { ...state, token: null };
    }
    case "endingFinished": {
      return { ...state, isEnding: false };
    }
    case "endingStarted": {
      return { ...state, isEnding: true };
    }
    case "joinBlocked":
    case "joinFailed":
    case "roomError": {
      return { ...state, isJoining: false, joinError: action.message };
    }
    case "joinStarted": {
      return { ...state, isJoining: true, joinError: null };
    }
    case "joinSucceeded": {
      return { ...state, isJoining: false, token: action.token };
    }
    default: {
      return state;
    }
  }
}

export function HumanMeetingRoom(props: HumanMeetingRoomProps) {
  const [state, dispatch] = useReducer(meetingRoomReducer, initialMeetingRoomState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { isEnding, isJoining, joinError, token } = state;
  const startBlockMessage = getStartBlockMessage(
    props.preview.scheduledAt,
    props.preview.status,
    nowMs,
  );

  useEffect(() => {
    const timestamp = getScheduledStartTimestamp(props.preview.scheduledAt, props.preview.status);
    if (timestamp === null) {
      return;
    }
    const remainingMs = timestamp - Date.now();
    if (remainingMs <= 0) {
      return;
    }
    const timer = window.setTimeout(
      () => {
        setNowMs(Date.now());
      },
      Math.min(remainingMs, 60_000),
    );
    return () => window.clearTimeout(timer);
  }, [props.preview.scheduledAt, props.preview.status, nowMs]);

  async function joinMeeting() {
    if (startBlockMessage) {
      dispatch({ message: startBlockMessage, type: "joinBlocked" });
      toast.warning(startBlockMessage);
      return;
    }
    dispatch({ type: "joinStarted" });
    const result = await loadMeetingToken(props);
    if (result.token) {
      dispatch({ token: result.token, type: "joinSucceeded" });
      return;
    }
    dispatch({ message: result.error, type: "joinFailed" });
    toast.error(result.error);
  }

  async function endMeeting(): Promise<void> {
    if (props.mode !== "interviewer") {
      return;
    }
    dispatch({ type: "endingStarted" });
    const result = await finishInterviewerMeeting(props.inviteToken);
    dispatch({ type: "endingFinished" });
    if (result.error) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success("会议已结束");
    dispatch({ type: "disconnected" });
  }

  if (!token) {
    const entryMessage = startBlockMessage ?? joinError;
    let joinButtonText = "进入会议";
    if (startBlockMessage) {
      joinButtonText = "未到入会时间";
    } else if (isJoining) {
      joinButtonText = "连接中…";
    }

    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
        <section className="w-full max-w-lg space-y-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-muted/60 bg-muted/30">
            <IconVideo className="size-6 text-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="font-semibold text-2xl tracking-normal">{getRoomTitle(props)}</h1>
            <p className="text-muted-foreground text-sm">{getRoomSubtitle(props)}</p>
          </div>
          {entryMessage ? (
            <p
              className={cn(
                "text-sm",
                startBlockMessage ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {entryMessage}
            </p>
          ) : null}
          <Button
            className="min-w-36"
            disabled={isJoining || Boolean(startBlockMessage)}
            onClick={joinMeeting}
            size="lg"
          >
            {isJoining ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconLogin className="size-4" />
            )}
            {joinButtonText}
          </Button>
        </section>
      </main>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      className="h-dvh overflow-hidden bg-zinc-950 text-white"
      connect
      onDisconnected={() => dispatch({ type: "disconnected" })}
      onError={(e) => {
        dispatch({ message: e.message, type: "roomError" });
        toast.error(e.message);
      }}
      serverUrl={token.serverUrl}
      token={token.participantToken}
      video={false}
    >
      <DefaultMicrophoneStarter enabled={token.participantRole !== "observer"} />
      <HumanMeetingStage
        canPublish={token.participantRole !== "observer"}
        canUseVoiceEffects={props.mode === "interviewer" && token.participantRole !== "observer"}
        canEndMeeting={props.mode === "interviewer"}
        isEnding={isEnding}
        onEndMeeting={endMeeting}
        participantName={token.participantName}
        title={getRoomTitle(props)}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function DefaultMicrophoneStarter({ enabled }: { enabled: boolean }) {
  const room = useRoomContext();
  const hasTriedStart = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    async function startDefaultMicrophone() {
      if (cancelled || hasTriedStart.current) {
        return;
      }
      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (publication?.isEnabled && !publication.isMuted) {
        hasTriedStart.current = true;
        return;
      }

      hasTriedStart.current = true;
      try {
        await room.localParticipant.setMicrophoneEnabled(true, { deviceId: "default" });
      } catch (error) {
        hasTriedStart.current = false;
        toast.error(error instanceof Error ? error.message : "默认麦克风启用失败");
      }
    }

    if (room.state === ConnectionState.Connected) {
      void startDefaultMicrophone();
    }
    room.on(RoomEvent.Connected, startDefaultMicrophone);

    return () => {
      cancelled = true;
      room.off(RoomEvent.Connected, startDefaultMicrophone);
    };
  }, [enabled, room]);

  return null;
}

function HumanMeetingStage({
  canPublish,
  canUseVoiceEffects,
  canEndMeeting,
  isEnding,
  onEndMeeting,
  participantName,
  title,
}: {
  canPublish: boolean;
  canUseVoiceEffects: boolean;
  canEndMeeting: boolean;
  isEnding: boolean;
  onEndMeeting: () => Promise<void> | void;
  participantName: string;
  title: string;
}) {
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: true },
    ],
    { onlySubscribed: false },
  );

  async function handleEndConfirm(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const ended = await runEndMeeting(onEndMeeting);
    if (ended) {
      setEndConfirmOpen(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-white/10 border-b px-4 py-3">
        <div>
          <h1 className="font-medium text-xl text-white tracking-normal">{title}</h1>
          <p className="text-white/60 text-xs">{participantName}</p>
        </div>
        <Badge variant="inverse">
          <IconUsers data-icon="inline-start" />
          {participants.length}
        </Badge>
      </header>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-3 p-3",
          "auto-rows-fr overflow-hidden",
          tracks.length <= 1 && "grid-cols-1",
          tracks.length > 1 && tracks.length <= 4 && "grid-cols-1 md:grid-cols-2",
          tracks.length > 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        <TrackLoop tracks={tracks}>
          <HumanParticipantTile />
        </TrackLoop>
      </div>

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
              className={controlButtonClass}
              showIcon={false}
              source={Track.Source.ScreenShare}
            >
              <IconDeviceDesktopUp className="size-4" />
              共享屏幕
            </TrackToggle>
          </>
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

const controlButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm text-white transition hover:bg-white/15";

const mediaToggleButtonClass = `${controlButtonClass} [&[data-lk-enabled='true']_.toggle-off]:hidden [&[data-lk-enabled='false']_.toggle-on]:hidden`;

const leaveButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-red-400/40 bg-red-500 px-3 text-sm text-white transition hover:bg-red-500/90";

const endButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-amber-300/40 bg-amber-500 px-3 text-sm text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60";
