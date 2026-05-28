"use client";

/* oxlint-disable no-use-before-define -- exported room wrapper stays above local stage helpers. */

import {
  DisconnectButton,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackLoop,
  TrackToggle,
  useMediaDeviceSelect,
  useRoomContext,
  useTrackRefContext,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleStopIcon,
  Loader2Icon,
  LogInIcon,
  MicOffIcon,
  MicIcon,
  MonitorUpIcon,
  PhoneOffIcon,
  UsersIcon,
  VideoOffIcon,
  VideoIcon,
} from "lucide-react";
import { ConnectionState, RoomEvent, Track } from "livekit-client";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  HumanInterviewMeetingTokenResponse,
  PublicHumanInterviewInterviewerPreview,
  PublicHumanInterviewMeetingPreview,
} from "@/lib/shared/studio-pipeline-stages";
import { cn } from "@/lib/shared/utils";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

interface TokenErrorPayload {
  error?: string;
  message?: string;
}

async function fetchCandidateToken(
  inviteToken: string,
): Promise<HumanInterviewMeetingTokenResponse> {
  const response = await fetch(
    `/api/public/human-interview-meetings/${encodeURIComponent(inviteToken)}/livekit-token`,
    { method: "POST" },
  );
  const body = (await response.json().catch(() => null)) as TokenErrorPayload | null;
  if (!response.ok) {
    throw new Error(body?.error ?? body?.message ?? `进入会议失败（${response.status}）`);
  }
  return body as HumanInterviewMeetingTokenResponse;
}

async function fetchInterviewerToken(
  inviteToken: string,
): Promise<HumanInterviewMeetingTokenResponse> {
  const response = await fetch(
    `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}/livekit-token`,
    { method: "POST" },
  );
  const body = (await response.json().catch(() => null)) as TokenErrorPayload | null;
  if (!response.ok) {
    throw new Error(body?.error ?? body?.message ?? `进入会议失败（${response.status}）`);
  }
  return body as HumanInterviewMeetingTokenResponse;
}

async function endInterviewerMeeting(inviteToken: string): Promise<void> {
  const response = await fetch(
    `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(inviteToken)}/end`,
    { method: "POST" },
  );
  const body = (await response.json().catch(() => null)) as TokenErrorPayload | null;
  if (!response.ok) {
    throw new Error(body?.error ?? body?.message ?? `结束会议失败（${response.status}）`);
  }
}

const interviewerRoleLabel = {
  host: "主持人",
  interviewer: "面试官",
  observer: "旁听",
} as const;
const EARLY_JOIN_WINDOW_MS = 5 * 60 * 1000;

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return "时间未定";
  }
  const value = new Date(iso);
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
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

interface ParticipantMetadata {
  participant_role?: string;
  participant_type?: string;
}

function parseParticipantMetadata(metadata: string | undefined): ParticipantMetadata {
  if (!metadata) {
    return {};
  }
  try {
    return JSON.parse(metadata) as ParticipantMetadata;
  } catch {
    return {};
  }
}

function getParticipantBadge(trackRef: TrackReferenceOrPlaceholder): {
  label: string;
  tone: "candidate" | "interviewer";
} {
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

export function HumanMeetingRoom(props: HumanMeetingRoomProps) {
  const [token, setToken] = useState<HumanInterviewMeetingTokenResponse | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
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
      setNowMs(Date.now());
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

  const joinMeeting = useCallback(async () => {
    if (startBlockMessage) {
      setJoinError(startBlockMessage);
      toast.warning(startBlockMessage);
      return;
    }
    setIsJoining(true);
    setJoinError(null);
    try {
      const nextToken =
        props.mode === "candidate"
          ? await fetchCandidateToken(props.inviteToken)
          : await fetchInterviewerToken(props.inviteToken);
      setToken(nextToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "进入会议失败";
      setJoinError(message);
      toast.error(message);
    } finally {
      setIsJoining(false);
    }
  }, [props, startBlockMessage]);

  const endMeeting = useCallback(async () => {
    if (props.mode !== "interviewer") {
      return;
    }
    setIsEnding(true);
    try {
      await endInterviewerMeeting(props.inviteToken);
      toast.success("会议已结束");
      setToken(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "结束会议失败");
      throw error;
    } finally {
      setIsEnding(false);
    }
  }, [props]);

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
          <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-border/70 bg-muted/40">
            <VideoIcon className="size-6 text-foreground" />
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
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <LogInIcon className="size-4" />
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
      onDisconnected={() => setToken(null)}
      onError={(e) => {
        setJoinError(e.message);
        toast.error(e.message);
      }}
      serverUrl={token.serverUrl}
      token={token.participantToken}
      video={false}
    >
      <DefaultMicrophoneStarter enabled={token.participantRole !== "observer"} />
      <HumanMeetingStage
        canPublish={token.participantRole !== "observer"}
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
  canEndMeeting,
  isEnding,
  onEndMeeting,
  participantName,
  title,
}: {
  canPublish: boolean;
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
    try {
      await onEndMeeting();
      setEndConfirmOpen(false);
    } catch {
      // Toast is handled by the parent mutation wrapper.
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-white/10 border-b px-4 py-3">
        <div>
          <h1 className="font-medium text-base tracking-normal">{title}</h1>
          <p className="text-white/60 text-xs">{participantName}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-white/70 text-xs">
          <UsersIcon className="size-3.5" />
          {participants.length}
        </div>
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
              <MicIcon className="toggle-on size-4" />
              <MicOffIcon className="toggle-off size-4" />
              <span className="toggle-on">麦克风</span>
              <span className="toggle-off">已静音</span>
            </TrackToggle>
            <MicrophoneDeviceMenu />
            <TrackToggle
              className={mediaToggleButtonClass}
              showIcon={false}
              source={Track.Source.Camera}
            >
              <VideoIcon className="toggle-on size-4" />
              <VideoOffIcon className="toggle-off size-4" />
              <span className="toggle-on">摄像头</span>
              <span className="toggle-off">摄像头已关</span>
            </TrackToggle>
            <TrackToggle
              className={controlButtonClass}
              showIcon={false}
              source={Track.Source.ScreenShare}
            >
              <MonitorUpIcon className="size-4" />
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
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CircleStopIcon className="size-4" />
            )}
            {isEnding ? "结束中…" : "结束会议"}
          </button>
        ) : null}
        <DisconnectButton className={leaveButtonClass}>
          <PhoneOffIcon className="size-4" />
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
              {isEnding ? <Loader2Icon className="size-4 animate-spin" /> : null}
              确认结束
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getDeviceLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label) {
    return device.label;
  }
  if (device.deviceId === "default") {
    return "系统默认麦克风";
  }
  return `麦克风 ${index + 1}`;
}

function MicrophoneDeviceMenu() {
  const { activeDeviceId, devices, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: "audioinput",
    requestPermissions: false,
  });
  const selectedDevice = devices.find((device) => device.deviceId === activeDeviceId);
  const selectedLabel = selectedDevice
    ? getDeviceLabel(selectedDevice, devices.indexOf(selectedDevice))
    : "系统默认麦克风";

  async function handleSelect(deviceId: string) {
    try {
      await setActiveMediaDevice(deviceId);
      toast.success("已切换麦克风");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换麦克风失败");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={deviceButtonClass} type="button">
          <MicIcon className="size-4" />
          <span className="max-w-36 truncate">{selectedLabel}</span>
          <ChevronDownIcon className="size-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72" side="top">
        {devices.length === 0 ? (
          <DropdownMenuItem disabled>未检测到麦克风</DropdownMenuItem>
        ) : (
          devices.map((device, index) => (
            <DropdownMenuItem
              className="flex items-center justify-between gap-2"
              key={device.deviceId}
              onSelect={() => void handleSelect(device.deviceId)}
            >
              <span className="truncate">{getDeviceLabel(device, index)}</span>
              {device.deviceId === activeDeviceId ? (
                <CheckIcon className="size-4 shrink-0" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
      <div
        className={cn(
          "pointer-events-none absolute top-3 left-3 z-20 max-w-[calc(100%-1.5rem)] truncate rounded-md px-2.5 py-1 font-medium text-xs shadow-sm backdrop-blur",
          badge.tone === "candidate"
            ? "border border-sky-300/45 bg-sky-400/90 text-sky-950"
            : "border border-white/15 bg-black/55 text-white",
        )}
        title={badge.label}
      >
        {badge.label}
      </div>
    </div>
  );
}

const controlButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm text-white transition hover:bg-white/15";

const mediaToggleButtonClass = `${controlButtonClass} [&[data-lk-enabled='true']_.toggle-off]:hidden [&[data-lk-enabled='false']_.toggle-on]:hidden`;

const deviceButtonClass =
  "inline-flex h-9 max-w-48 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm text-white transition hover:bg-white/15";

const leaveButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-red-400/40 bg-red-500 px-3 text-sm text-white transition hover:bg-red-500/90";

const endButtonClass =
  "inline-flex h-9 items-center gap-2 rounded-md border border-amber-300/40 bg-amber-500 px-3 text-sm text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60";
