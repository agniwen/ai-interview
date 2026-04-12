'use client';

import { useSession } from '@livekit/components-react';
import { ConnectionState, TokenSource } from 'livekit-client';
import { MicIcon, TriangleAlertIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
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

  const handleStart = useCallback(() => {
    session.start({ tracks: { microphone: { enabled: true } } });
  }, [session]);

  if (isDisconnected || isConnecting) {
    return (
      <main className='flex h-dvh w-full flex-col items-center justify-center gap-6'>
        <div className='flex flex-col items-center gap-3 text-center'>
          <h1 className='text-2xl font-semibold'>AI 模拟面试</h1>
          <p className='text-muted-foreground text-sm'>
            点击下方按钮开始面试，请确保麦克风已开启
          </p>
        </div>
        <Button
          size='lg'
          variant='outline'
          disabled={isConnecting}
          onClick={handleStart}
          className='gap-2 rounded-full px-8'
        >
          <MicIcon className='size-4' />
          {isConnecting ? '连接中...' : '开始面试'}
        </Button>
      </main>
    );
  }

  return (
    <AgentSessionProvider session={session}>
      <main className='relative h-dvh w-full overflow-hidden'>
        <AgentSessionView_01
          supportsVideoInput={false}
          supportsScreenShare={false}
          preConnectMessage='面试已开始，请开始作答'
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
