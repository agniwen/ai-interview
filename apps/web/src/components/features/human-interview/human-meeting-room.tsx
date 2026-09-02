"use client";

import {
  IconCheck,
  IconFileDescription,
  IconLoader2,
  IconLogin,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- exported room wrapper stays above local stage helpers. */

import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";

import { ConnectionState, RoomEvent, Track } from "livekit-client";
import { useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import type {
  HumanInterviewMeetingTokenResponse,
  PublicHumanInterviewInterviewerPreview,
  PublicHumanInterviewMeetingPreview,
} from "@app/shared/studio-pipeline-stages";
import { humanInterviewRecordingStatusSchema } from "@app/db-schema/studio-interviews";
import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import { HumanMeetingStage, humanMeetingControlButtonClass } from "./human-meeting-stage";
import { resolveInitialHumanMeetingViewMode } from "./human-meeting-materials-model";
import type { HumanMeetingViewMode } from "./human-meeting-materials-model";
import { InterviewerCandidateMaterials } from "./interviewer-candidate-materials";
import { HumanMeetingReview } from "./human-meeting-review";
import {
  getHumanInterviewRecordingPollDelayMs,
  shouldPollHumanInterviewRecordingStatus,
} from "./human-meeting-recording-status";
import type { InterviewerCandidateMaterialsState } from "./interviewer-candidate-materials";

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

async function fetchRecordingStatus(props: HumanMeetingRoomProps) {
  const path =
    props.mode === "candidate"
      ? `/api/public/human-interview-meetings/${encodeURIComponent(props.inviteToken)}`
      : `/api/public/human-interview-meetings/interviewer/${encodeURIComponent(props.inviteToken)}`;
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  const body = z
    .object({ recordingStatus: humanInterviewRecordingStatusSchema })
    .safeParse(await response.json());
  return body.success ? body.data.recordingStatus : null;
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

async function respondCandidateInvitation(
  inviteToken: string,
  action: "accept" | "decline",
): Promise<"accepted" | "declined"> {
  const response = await fetch(
    `/api/public/human-interview-meetings/${encodeURIComponent(inviteToken)}/respond`,
    {
      body: JSON.stringify({ action }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const errorPayload = tokenErrorPayloadSchema.safeParse(body);
    throw new Error(
      errorPayload.success
        ? (errorPayload.data.error ?? errorPayload.data.message ?? "提交邀请响应失败")
        : "提交邀请响应失败",
    );
  }
  const parsed = z.object({ status: z.enum(["accepted", "declined"]) }).safeParse(body);
  if (!parsed.success) {
    throw new Error("邀请响应结果无效");
  }
  return parsed.data.status;
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
  timeZone: "Asia/Shanghai",
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

function getJoinButtonText(startBlockMessage: string | null, isJoining: boolean) {
  if (startBlockMessage) {
    return "未到入会时间";
  }
  if (isJoining) {
    return "连接中…";
  }
  return "进入会议";
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

// oxlint-disable-next-line complexity -- room orchestration intentionally keeps media, timing, materials, and review state at one boundary.
export function HumanMeetingRoom(props: HumanMeetingRoomProps) {
  const [state, dispatch] = useReducer(meetingRoomReducer, initialMeetingRoomState);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [candidateInviteStatus, setCandidateInviteStatus] = useState(() =>
    props.mode === "candidate" ? props.preview.candidateInviteStatus : "accepted",
  );
  const [candidateResponsePending, setCandidateResponsePending] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(props.preview.recordingStatus);
  const [recordingFailedPolls, setRecordingFailedPolls] = useState(0);
  const [viewMode, setViewMode] = useState<HumanMeetingViewMode>(() =>
    resolveInitialHumanMeetingViewMode(props.mode, props.preview.status),
  );
  const [candidateMaterialsState, setCandidateMaterialsState] =
    useState<InterviewerCandidateMaterialsState>({
      candidateId: null,
      centerTab: "detail",
      leftTab: "ai",
    });
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

  // oxlint-disable-next-line react-doctor/no-fetch-in-effect -- recording state is a bounded, cancellable poll of the active public meeting.
  useEffect(() => {
    if (!shouldPollHumanInterviewRecordingStatus(token, recordingStatus)) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const status = await fetchRecordingStatus(props);
        if (!cancelled && status) {
          setRecordingStatus(status);
          setRecordingFailedPolls((attempts) => (status === "failed" ? attempts + 1 : 0));
        }
      } catch {
        // Preview polling is best effort; the next interval retries.
      }
    };
    const timer = window.setTimeout(
      refresh,
      getHumanInterviewRecordingPollDelayMs(recordingStatus, recordingFailedPolls),
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [props, recordingFailedPolls, recordingStatus, token]);

  async function joinMeeting() {
    if (startBlockMessage) {
      dispatch({ message: startBlockMessage, type: "joinBlocked" });
      toast.warning(startBlockMessage);
      return;
    }
    dispatch({ type: "joinStarted" });
    const result = await loadMeetingToken(props);
    if (result.token) {
      setViewMode("meeting");
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
    setViewMode("review");
    dispatch({ type: "disconnected" });
  }

  async function respondToInvitation(action: "accept" | "decline") {
    if (props.mode !== "candidate") {
      return;
    }
    setCandidateResponsePending(true);
    try {
      const status = await respondCandidateInvitation(props.inviteToken, action);
      setCandidateInviteStatus(status);
      toast.success(status === "accepted" ? "已确认参加面试" : "已拒绝本次面试");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交邀请响应失败");
    } finally {
      setCandidateResponsePending(false);
    }
  }

  if (props.mode === "candidate" && candidateInviteStatus !== "accepted") {
    const canRespond = candidateInviteStatus === "pending" || candidateInviteStatus === "sent";
    return (
      <main className="dark mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center bg-background px-6 py-16 text-foreground">
        <p className="mb-3 text-muted-foreground text-sm">{props.preview.roundLabel}</p>
        <h1 className="text-2xl font-semibold">{props.preview.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {props.preview.candidateName}，请确认是否参加本次面试。
        </p>
        <div className="mt-8 border-border border-y py-5 font-medium">
          {formatDateTime(props.preview.scheduledAt)}
        </div>
        {canRespond ? (
          <div className="mt-8 flex gap-3">
            <Button
              disabled={candidateResponsePending}
              onClick={async () => {
                await respondToInvitation("accept");
              }}
            >
              <IconCheck className="size-4" />
              {candidateResponsePending ? "处理中…" : "确认参加"}
            </Button>
            <Button
              disabled={candidateResponsePending}
              onClick={async () => {
                await respondToInvitation("decline");
              }}
              variant="outline"
            >
              <IconX className="size-4" />
              无法参加
            </Button>
          </div>
        ) : (
          <p className="mt-8 text-muted-foreground text-sm">
            {candidateInviteStatus === "declined"
              ? "你已拒绝本次面试，如需变更请联系 HR。"
              : "该邀请已失效，请联系 HR。"}
          </p>
        )}
      </main>
    );
  }

  if (!token) {
    if (props.mode === "interviewer" && viewMode !== "meeting") {
      return (
        <main className="dark flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-950 text-white">
          <header className="flex shrink-0 items-center justify-between gap-3 border-white/10 border-b px-4 py-3">
            <div>
              <h1 className="font-medium text-white text-xl tracking-normal">
                {getRoomTitle(props)}
              </h1>
              <p className="text-white/60 text-xs">
                {viewMode === "materials" ? "面试准备 · 候选人资料" : "面试评价"}
              </p>
            </div>
          </header>
          <div className="min-h-0 flex-1">
            {viewMode === "materials" ? (
              <InterviewerCandidateMaterials
                active
                inviteToken={props.inviteToken}
                onStateChange={setCandidateMaterialsState}
                state={candidateMaterialsState}
              />
            ) : (
              <HumanMeetingReview active inviteToken={props.inviteToken} />
            )}
          </div>
          <footer className="flex shrink-0 items-center justify-center border-white/10 border-t px-4 py-3">
            <button
              className={humanMeetingControlButtonClass}
              onClick={() => setViewMode("meeting")}
              type="button"
            >
              <IconVideo className="size-4" />
              返回入会页
            </button>
          </footer>
        </main>
      );
    }
    const entryMessage = startBlockMessage ?? joinError;
    const joinButtonText = getJoinButtonText(startBlockMessage, isJoining);

    return (
      <main className="dark flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
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
          <div className="flex flex-wrap items-center justify-center gap-3">
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
            {props.mode === "interviewer" ? (
              <>
                <Button onClick={() => setViewMode("materials")} size="lg" variant="outline">
                  <IconFileDescription className="size-4" />
                  候选人资料
                </Button>
                <Button onClick={() => setViewMode("review")} size="lg" variant="outline">
                  面试评价
                </Button>
              </>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <LiveKitRoom
      audio={false}
      className="dark h-dvh overflow-hidden bg-zinc-950 text-white"
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
        canUseLiveTranscript={props.mode === "interviewer" && token.participantRole !== "observer"}
        canUseVoiceEffects={props.mode === "interviewer" && token.participantRole !== "observer"}
        canEndMeeting={props.mode === "interviewer" && token.participantRole !== "observer"}
        isEnding={isEnding}
        onEndMeeting={endMeeting}
        inviteToken={props.mode === "interviewer" ? props.inviteToken : null}
        candidateMaterialsState={candidateMaterialsState}
        onCandidateMaterialsStateChange={setCandidateMaterialsState}
        onViewModeChange={setViewMode}
        participantName={token.participantName}
        recordingStatus={recordingStatus}
        title={getRoomTitle(props)}
        viewMode={props.mode === "interviewer" ? viewMode : "meeting"}
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
