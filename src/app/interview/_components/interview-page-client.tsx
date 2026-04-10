'use client';

import { useSession } from '@livekit/components-react';
import { TokenSource } from 'livekit-client';
import { TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
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

  return (
    <AgentSessionProvider session={session}>
      <main className='relative h-dvh w-full overflow-hidden'>
        <AgentSessionView_01
          supportsVideoInput={false}
          supportsScreenShare={false}
          preConnectMessage='面试即将开始，请确认麦克风已开启'
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
