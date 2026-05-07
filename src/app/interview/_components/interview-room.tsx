"use client";

import type { LucideIcon } from "lucide-react";
import type { CandidateInterviewView } from "@/lib/interview/interview-record";
import { useAgent, useSession } from "@livekit/components-react";
import { ConnectionState, TokenSource } from "livekit-client";
import {
  MessageSquareTextIcon,
  MicIcon,
  MicOffIcon,
  TriangleAlertIcon,
  UserCheckIcon,
  VideoIcon,
  Volume2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { StartAudioButton } from "@/components/agents-ui/start-audio-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { InterviewTimer } from "./interview-timer";
import { PreInterviewFormsView } from "./pre-interview-forms-view";

function AgentSpeechTimer() {
  const { state } = useAgent();
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null && state === "speaking") {
      setStartedAt(Date.now());
    }
  }, [state, startedAt]);

  return <InterviewTimer startedAt={startedAt} />;
}

interface InterviewRoomProps {
  interviewId: string;
  roundId: string;
}

function resolveStartButtonLabel({
  isConnecting,
  isLoadingStatus,
  muted,
}: {
  isConnecting: boolean;
  isLoadingStatus: boolean;
  muted: boolean;
}) {
  if (isConnecting) {
    return "连接中...";
  }
  if (isLoadingStatus) {
    return "加载中...";
  }
  return muted ? "静音开始" : "开始面试";
}

function resolveTitle(isRoundCompleted: boolean, candidateName: string) {
  if (isRoundCompleted) {
    return "面试已结束";
  }
  if (candidateName) {
    return `你好，${candidateName}`;
  }
  return "欢迎参加面试";
}

function buildSubheading({
  targetRole,
  roundLabel,
  questionCount,
}: {
  targetRole: string | null;
  roundLabel: string | null;
  questionCount: number;
}) {
  const parts: string[] = [];
  if (targetRole) {
    parts.push(targetRole);
  }
  if (roundLabel) {
    parts.push(roundLabel);
  }
  const prefix = parts.join(" · ");
  const countText = questionCount > 0 ? `共 ${questionCount} 题，` : "";
  const trailing = "预计 20 分钟内完成。";
  return prefix ? `${prefix} · ${countText}${trailing}` : `${countText}${trailing}`;
}

function resolveSubheading({
  isRoundCompleted,
  isRecovering,
  questionCount,
  roundLabel,
  targetRole,
}: {
  isRoundCompleted: boolean;
  isRecovering: boolean;
  questionCount: number;
  roundLabel: string | null;
  targetRole: string | null;
}) {
  if (isRoundCompleted) {
    return "本轮面试已结束，如需重新面试请联系管理员。";
  }
  if (isRecovering) {
    return "正在为你重新接入刚才的对话，请稍候...";
  }
  return buildSubheading({ questionCount, roundLabel, targetRole });
}

function RuleItem({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3 py-4 sm:gap-4 sm:py-5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground sm:size-4.5" />
      <div className="flex flex-col gap-1">
        <div className="font-medium text-sm sm:text-base">{title}</div>
        <p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">{description}</p>
      </div>
    </li>
  );
}

function WaitingView({
  interviewView,
  isConnecting,
  isLoadingStatus,
  isRoundCompleted,
  isRecovering,
  onStart,
}: {
  interviewView: CandidateInterviewView | null;
  isConnecting: boolean;
  isLoadingStatus: boolean;
  isRoundCompleted: boolean;
  // 重连恢复中：跳过 RuleItem 与开始按钮，仅展示「正在恢复连接」骨架。
  // Recovery mode: hide rules + start buttons, show only a "reconnecting" hint.
  isRecovering: boolean;
  onStart: (options?: { muted?: boolean }) => void;
}) {
  const candidateName = interviewView?.candidateName ?? "";
  const targetRole = interviewView?.targetRole ?? null;
  const roundLabel = interviewView?.currentRoundLabel ?? null;
  const questionCount = interviewView?.interviewQuestions?.length ?? 0;
  const startDisabled = isConnecting || isLoadingStatus;
  const showRulesAndButtons = !isRoundCompleted && !isRecovering;
  const subheadingText = resolveSubheading({
    isRecovering,
    isRoundCompleted,
    questionCount,
    roundLabel,
    targetRole,
  });
  const primaryLabel = resolveStartButtonLabel({
    isConnecting,
    isLoadingStatus,
    muted: false,
  });
  const mutedLabel = resolveStartButtonLabel({
    isConnecting,
    isLoadingStatus,
    muted: true,
  });

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-20 bg-[url('/textures/interview-prep-light.png')] bg-center bg-cover bg-no-repeat dark:bg-[url('/textures/interview-prep-dark.png')]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white/5 dark:hidden" />
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <main className="relative flex min-h-dvh w-full select-none flex-col md:items-center md:justify-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-5 pt-12  sm:px-2 sm:pt-20 md:pt-16">
          <section>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {isRecovering ? "正在恢复面试连接" : resolveTitle(isRoundCompleted, candidateName)}
            </h1>
            <p className="mt-2 text-muted-foreground text-sm sm:text-base">{subheadingText}</p>
          </section>

          {showRulesAndButtons && (
            <section className="mt-10 sm:mt-14">
              <h2 className="mb-4 font-medium text-muted-foreground text-sm sm:mb-5">
                开始前，请留意
              </h2>
              <ul className="divide-y divide-border/60 border-border/60 border-y">
                <RuleItem
                  description="建议佩戴耳机并在网络稳定的地方作答。若环境嘈杂，可选择「静音开始」，以文字方式与面试官沟通。"
                  icon={Volume2Icon}
                  title="保持安静的环境"
                />
                <RuleItem
                  description="等面试官提完问题再作答，答完等下一题。请围绕问题展开，结合具体项目与经历说明。"
                  icon={MessageSquareTextIcon}
                  title="一次只答一题"
                />
                <RuleItem
                  description="保持严肃与尊重；连续答非所问或跳过题目会影响评分，必要时面试官会结束面试。"
                  icon={UserCheckIcon}
                  title="认真作答"
                />
                <RuleItem
                  description="面试将通过摄像头全程录制，开始后请保持摄像头开启，期间不能关闭。"
                  icon={VideoIcon}
                  title="保持摄像头录制"
                />
                <RuleItem
                  description="尽量不要刷新页面或关闭标签页。如遇网络中断，请在 3 分钟内回到本页面，可继续之前的对话；超过 3 分钟本轮将自动结束。"
                  icon={TriangleAlertIcon}
                  title="保持稳定连接"
                />
              </ul>
            </section>
          )}

          {showRulesAndButtons && (
            <div className="mt-10 hidden items-center gap-3 sm:mt-12 md:flex">
              <Button
                className="h-11 flex-1 gap-2"
                disabled={startDisabled}
                onClick={() => onStart({ muted: true })}
                size="lg"
                variant="outline"
              >
                <MicOffIcon className="size-4" />
                {mutedLabel}
              </Button>
              <Button
                className="h-11 flex-[2] gap-2"
                disabled={startDisabled}
                onClick={() => onStart()}
                size="lg"
              >
                <MicIcon className="size-4" />
                {primaryLabel}
              </Button>
            </div>
          )}
        </div>

        {showRulesAndButtons && (
          <div className="fixed inset-x-0 bottom-0 z-10 border-border/60 border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
            <div className="mx-auto flex w-full max-w-md items-center gap-3">
              <Button
                className="h-11 flex-1 gap-2"
                disabled={startDisabled}
                onClick={() => onStart({ muted: true })}
                variant="outline"
              >
                <MicOffIcon className="size-4" />
                {mutedLabel}
              </Button>
              <Button
                className="h-11 flex-[2] gap-2"
                disabled={startDisabled}
                onClick={() => onStart()}
              >
                <MicIcon className="size-4" />
                {primaryLabel}
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function InterviewRoom({ interviewId, roundId }: InterviewRoomProps) {
  const [interviewView, setInterviewView] = useState<CandidateInterviewView | null>(null);
  const [roundStatus, setRoundStatus] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/interview/${interviewId}/${roundId}`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as CandidateInterviewView;
        if (!cancelled) {
          setInterviewView(data);
          setRoundStatus(data.currentRoundStatus);
        }
      } catch {
        // ignore — will fall through to default state
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false);
        }
      }
    }

    void fetchStatus();
    // eslint-disable-next-line style/max-statements-per-line
    return () => {
      cancelled = true;
    };
  }, [interviewId, roundId]);

  const isRoundCompleted = roundStatus === "completed";
  // 服务端基于 disconnectedAt + 3 分钟宽限期算出，仅在 interrupted 且窗口内非空。
  // Server-derived rejoin deadline; non-null only while interrupted within grace.
  const recoverableUntil = interviewView?.currentRoundRecoverableUntil ?? null;
  const isRecoverable =
    roundStatus === "interrupted" &&
    recoverableUntil !== null &&
    new Date(recoverableUntil).getTime() > Date.now();

  // Custom token source so that token-endpoint errors (403/409/410) can flip
  // the page into the appropriate state instead of letting the LiveKit
  // session silently fail.
  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async () => {
        const response = await fetch(`/api/interview/${interviewId}/${roundId}/livekit-token`, {
          method: "POST",
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            code?: string;
            error?: string;
          } | null;
          // 403: 轮次已结束；410: 重连超过 3 分钟宽限。两者最终都置 completed。
          // 409: 另一窗口/设备占用，留在 WaitingView 由 toast 引导用户。
          // 403/410 → completed; 409 → toast and stay in WaitingView.
          if (response.status === 403 || response.status === 410) {
            setRoundStatus("completed");
          } else if (response.status === 409) {
            toast.error(body?.error ?? "面试已在另一个窗口进行中。");
          }
          throw new Error(body?.error ?? `livekit-token 请求失败（${response.status}）`);
        }

        return (await response.json()) as {
          isReconnect?: boolean;
          participantName: string;
          participantToken: string;
          roomName: string;
          serverUrl: string;
        };
      }),
    [interviewId, roundId],
  );

  const agentName = process.env.NEXT_PUBLIC_AGENT_NAME;
  const session = useSession(tokenSource, agentName ? { agentName } : undefined);

  const isDisconnected = session.connectionState === ConnectionState.Disconnected;
  const isConnecting = session.connectionState === ConnectionState.Connecting;
  const wasConnectedRef = useRef(false);

  // 监听硬断连：进入 interrupted 状态而非立刻 completed，
  // 让候选人有 3 分钟宽限回到本页面继续面试。
  // Hard disconnect → mark interrupted (not completed) so the candidate has
  // a 3-minute window to rejoin. Authoritative completion comes from
  // /api/agent/report after the agent's grace timer fires.
  useEffect(() => {
    if (session.connectionState === ConnectionState.Connected) {
      wasConnectedRef.current = true;
    } else if (
      session.connectionState === ConnectionState.Disconnected &&
      wasConnectedRef.current
    ) {
      wasConnectedRef.current = false;
      void fetch(`/api/interview/${interviewId}/${roundId}/complete?mode=interrupt`, {
        keepalive: true,
        method: "POST",
      });
    }
  }, [session.connectionState, interviewId, roundId]);

  // beforeunload 兜底信号：用户关闭/刷新标签页时通过 sendBeacon 提前通知后端
  // 进入 interrupted，避免依赖 LiveKit 才发现断开导致延迟。两条路径幂等。
  // Belt-and-suspenders beacon for tab close/refresh, idempotent with the
  // disconnect handler above.
  useEffect(() => {
    const onBeforeUnload = () => {
      navigator.sendBeacon(`/api/interview/${interviewId}/${roundId}/complete?mode=interrupt`);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [interviewId, roundId]);

  const [startedMuted, setStartedMuted] = useState(false);
  // 自动续连只触发一次：避免 connectionState 变化或 fetchStatus 重跑时反复 session.start。
  // Latch the auto-rejoin so it fires at most once per page load.
  const autoRejoinTriggeredRef = useRef(false);

  const handleStart = useCallback(
    (options?: { muted?: boolean }) => {
      setStartedMuted(!!options?.muted);
      session.start({
        tracks: {
          // 默认开启摄像头以便服务端 RoomCompositeEgress 录像；
          // 浏览器拒绝权限时 LiveKit 会自动跳过该 track，不影响音频通话。
          // Enable camera by default so server-side RoomCompositeEgress captures
          // video; if the browser denies permission, LiveKit silently skips it.
          camera: {
            enabled: true,
          },
          microphone: {
            enabled: !options?.muted,
            publishOptions: {
              // @ts-expect-error ignore
              audioCaptureOptions: {
                autoGainControl: true,
                echoCancellation: true,
                noiseSuppression: true,
              },
            },
          },
        },
      });
    },
    [session],
  );

  // 刷新返回 + 仍在 3 分钟宽限期：跳过 RuleItem 自动 handleStart 续连。
  // On page reload during the grace window, auto-trigger handleStart so the
  // candidate lands directly back into the same room.
  useEffect(() => {
    if (!isLoadingStatus && isRecoverable && !autoRejoinTriggeredRef.current && isDisconnected) {
      autoRejoinTriggeredRef.current = true;
      handleStart();
    }
  }, [isLoadingStatus, isRecoverable, isDisconnected, handleStart]);

  // isRecovering 决定 WaitingView 是否展示规则与开始按钮：自动续连进行中时只展示「正在恢复连接」。
  // While auto-rejoining we hide the rules/start buttons and show a recovery hint.
  const isRecovering = isRecoverable && (isConnecting || autoRejoinTriggeredRef.current);

  if (isDisconnected || isConnecting) {
    const waitingView = (
      <WaitingView
        interviewView={interviewView}
        isConnecting={isConnecting}
        isLoadingStatus={isLoadingStatus}
        isRecovering={isRecovering}
        isRoundCompleted={isRoundCompleted}
        onStart={handleStart}
      />
    );
    if (isRoundCompleted) {
      return waitingView;
    }
    return (
      <PreInterviewFormsView interviewId={interviewId} roundId={roundId}>
        {waitingView}
      </PreInterviewFormsView>
    );
  }

  return (
    <AgentSessionProvider session={session}>
      <div className="fixed top-4 left-4 z-20">
        <AgentSpeechTimer />
      </div>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="relative h-dvh w-full select-none overflow-hidden">
        <AgentSessionView_01
          defaultChatOpen={startedMuted}
          supportsVideoInput={true}
          supportsScreenShare={false}
          chatInputEnabled={interviewView?.currentRoundAllowTextInput ?? false}
          onCameraDisableAttempt={() => {
            toast.warning("面试过程中需要保持摄像头录制，请勿关闭摄像头。");
          }}
          preConnectMessage="正在连线面试官，请稍等..."
        />
      </main>
      <StartAudioButton label="开始通话" />
      <Toaster
        position="top-center"
        icons={{ warning: <TriangleAlertIcon className="size-4" /> }}
      />
    </AgentSessionProvider>
  );
}
