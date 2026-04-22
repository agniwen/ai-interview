"use client";

import type { CandidateInterviewView } from "@/lib/interview/interview-record";
import { useSession } from "@livekit/components-react";
import { ConnectionState, TokenSource } from "livekit-client";
import { MicIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { StartAudioButton } from "@/components/agents-ui/start-audio-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

interface InterviewPageClientProps {
  interviewId: string;
  roundId: string;
}

function resolveStartButtonLabel({
  isConnecting,
  isLoadingStatus,
}: {
  isConnecting: boolean;
  isLoadingStatus: boolean;
}) {
  if (isConnecting) {
    return "连接中...";
  }
  if (isLoadingStatus) {
    return "加载中...";
  }
  return "开始面试";
}

export default function InterviewPageClient({ interviewId, roundId }: InterviewPageClientProps) {
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
      // Immediately notify backend so status updates without waiting for agent report
      void fetch(`/api/interview/${interviewId}/${roundId}/complete`, { method: "POST" });
    }
  }, [session.connectionState, interviewId, roundId]);

  const handleStart = useCallback(() => {
    session.start({
      tracks: {
        microphone: {
          enabled: true,
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
  }, [session]);

  if (isDisconnected || isConnecting) {
    return (
      <>
        <div className="fixed top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <main className="flex h-dvh w-full flex-col items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-2xl font-semibold">AI面试</h1>
            {isRoundCompleted ? (
              <div className="flex flex-col items-center gap-2">
                {/* <CheckCircle2Icon className='size-8 text-muted-foreground' /> */}
                <p className="text-muted-foreground text-sm">
                  本轮面试已结束，如需重新面试请联系管理员
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                点击下方按钮开始面试，请确保麦克风已开启
              </p>
            )}
          </div>
          {!isRoundCompleted && (
            <Button
              size="lg"
              variant="outline"
              disabled={isConnecting || isLoadingStatus}
              onClick={handleStart}
              className="gap-2 rounded-full px-8"
            >
              <MicIcon className="size-4" />
              {resolveStartButtonLabel({ isConnecting, isLoadingStatus })}
            </Button>
          )}
        </main>
      </>
    );
  }

  return (
    <AgentSessionProvider session={session}>
      <div className="fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <main className="relative h-dvh w-full overflow-hidden">
        <AgentSessionView_01
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
