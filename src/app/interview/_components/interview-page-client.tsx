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
  Volume2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface InterviewPageClientProps {
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
  onStart,
}: {
  interviewView: CandidateInterviewView | null;
  isConnecting: boolean;
  isLoadingStatus: boolean;
  isRoundCompleted: boolean;
  onStart: (options?: { muted?: boolean }) => void;
}) {
  const candidateName = interviewView?.candidateName ?? "";
  const targetRole = interviewView?.targetRole ?? null;
  const roundLabel = interviewView?.currentRoundLabel ?? null;
  const questionCount = interviewView?.interviewQuestions?.length ?? 0;
  const startDisabled = isConnecting || isLoadingStatus;
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

      <main className="relative flex min-h-dvh w-full flex-col md:items-center md:justify-center">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-5 pt-12  sm:px-2 sm:pt-20 md:pt-16">
          <section>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {resolveTitle(isRoundCompleted, candidateName)}
            </h1>
            {isRoundCompleted ? (
              <p className="mt-2 text-muted-foreground text-sm sm:text-base">
                本轮面试已结束，如需重新面试请联系管理员。
              </p>
            ) : (
              <p className="mt-2 text-muted-foreground text-sm sm:text-base">
                {buildSubheading({ questionCount, roundLabel, targetRole })}
              </p>
            )}
          </section>

          {!isRoundCompleted && (
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
              </ul>
            </section>
          )}

          {!isRoundCompleted && (
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

        {!isRoundCompleted && (
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

export default function InterviewPageClient({ interviewId, roundId }: InterviewPageClientProps) {
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

  // Custom token source so that a 403 from the livekit-token endpoint
  // (round already completed) can flip the page into the completed state
  // instead of letting the LiveKit session silently fail.
  const tokenSource = useMemo(
    () =>
      TokenSource.custom(async () => {
        const response = await fetch(`/api/interview/${interviewId}/${roundId}/livekit-token`, {
          method: "POST",
        });

        if (!response.ok) {
          if (response.status === 403) {
            setRoundStatus("completed");
          }
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `livekit-token 请求失败（${response.status}）`);
        }

        return (await response.json()) as {
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

  // Track if session was ever connected; mark round completed on disconnect
  useEffect(() => {
    if (session.connectionState === ConnectionState.Connected) {
      wasConnectedRef.current = true;
    } else if (
      session.connectionState === ConnectionState.Disconnected &&
      wasConnectedRef.current
    ) {
      wasConnectedRef.current = false;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      void setRoundStatus("completed");
      // Soft "user left the session" signal. The authoritative completion
      // (schedule/interview status + transcript) is written by the agent
      // calling /api/agent/report. keepalive ensures this fetch isn't
      // cancelled when the user closes the tab.
      void fetch(`/api/interview/${interviewId}/${roundId}/complete`, {
        keepalive: true,
        method: "POST",
      });
    }
  }, [session.connectionState, interviewId, roundId]);

  const [startedMuted, setStartedMuted] = useState(false);

  const handleStart = useCallback(
    (options?: { muted?: boolean }) => {
      setStartedMuted(!!options?.muted);
      session.start({
        tracks: {
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

  if (isDisconnected || isConnecting) {
    const waitingView = (
      <WaitingView
        interviewView={interviewView}
        isConnecting={isConnecting}
        isLoadingStatus={isLoadingStatus}
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
      <main className="relative h-dvh w-full overflow-hidden">
        <AgentSessionView_01
          defaultChatOpen={startedMuted}
          supportsVideoInput={false}
          supportsScreenShare={false}
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
