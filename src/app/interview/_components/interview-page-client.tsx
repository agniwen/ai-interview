'use client';

import type { CandidateInterviewView } from '@/lib/interview/interview-record';
import { useSession } from '@livekit/components-react';
import { ConnectionState, TokenSource } from 'livekit-client';
import { MicIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';

interface InterviewPageClientProps {
  interviewId: string
  roundId: string
}

export default function InterviewPageClient({
  interviewId,
  roundId,
}: InterviewPageClientProps) {
  const [roundStatus, setRoundStatus] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/interview/${interviewId}/${roundId}`);
        if (!res.ok)
          return;
        const data = (await res.json()) as CandidateInterviewView;
        if (!cancelled) {
          setRoundStatus(data.currentRoundStatus);
        }
      }
      catch {
        // ignore — will fall through to default state
      }
      finally {
        if (!cancelled)
          setIsLoadingStatus(false);
      }
    }

    void fetchStatus();
    // eslint-disable-next-line style/max-statements-per-line
    return () => { cancelled = true; };
  }, [interviewId, roundId]);

  const isRoundCompleted = roundStatus === 'completed';

  const tokenSource = useMemo(
    () => TokenSource.endpoint(`/api/interview/${interviewId}/${roundId}/livekit-token`),
    [interviewId, roundId],
  );

  const agentName = process.env.NEXT_PUBLIC_AGENT_NAME;
  const session = useSession(
    tokenSource,
    agentName ? { agentName } : undefined,
  );

  const isDisconnected = session.connectionState === ConnectionState.Disconnected;
  const isConnecting = session.connectionState === ConnectionState.Connecting;
  const wasConnectedRef = useRef(false);

  // Track if session was ever connected; mark round completed on disconnect
  useEffect(() => {
    if (session.connectionState === ConnectionState.Connected) {
      wasConnectedRef.current = true;
    }
    else if (session.connectionState === ConnectionState.Disconnected && wasConnectedRef.current) {
      wasConnectedRef.current = false;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      void setRoundStatus('completed');
      // Immediately notify backend so status updates without waiting for agent report
      void fetch(`/api/interview/${interviewId}/${roundId}/complete`, { method: 'POST' });
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
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
            },
          },
        },
      },
    });
  }, [session]);

  if (isDisconnected || isConnecting) {
    return (
      <main className='flex h-dvh w-full flex-col items-center justify-center gap-6'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <h1 className='text-2xl font-semibold'>AI面试</h1>
          {isRoundCompleted
            ? (
                <div className='flex flex-col items-center gap-2'>
                  {/* <CheckCircle2Icon className='size-8 text-muted-foreground' /> */}
                  <p className='text-muted-foreground text-sm'>
                    本轮面试已结束，如需重新面试请联系管理员
                  </p>
                </div>
              )
            : (
                <p className='text-muted-foreground text-sm'>
                  点击下方按钮开始面试，请确保麦克风已开启
                </p>
              )}
        </div>
        {!isRoundCompleted && (
          <Button
            size='lg'
            variant='outline'
            disabled={isConnecting || isLoadingStatus}
            onClick={handleStart}
            className='gap-2 rounded-full px-8'
          >
            <MicIcon className='size-4' />
            {isConnecting ? '连接中...' : isLoadingStatus ? '加载中...' : '开始面试'}
          </Button>
        )}
      </main>
    );
  }

  return (
    <AgentSessionProvider session={session}>
      <main className='relative h-dvh w-full overflow-hidden'>
        <AgentSessionView_01
          supportsVideoInput={false}
          supportsScreenShare={false}
          preConnectMessage='正在连线面试官，请稍等...'
        />
      </main>
      <StartAudioButton label='开始通话' />
      <Toaster
        position='top-center'
        icons={{ warning: <TriangleAlertIcon className='size-4' /> }}
      />
    </AgentSessionProvider>
  );
}
