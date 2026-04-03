import { Suspense } from 'react';
import ChatPageClient from '@/app/chat/_components/chat-page-client';

async function ChatSessionContent({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params;

  return <ChatPageClient initialSessionId={sessionId} key={sessionId} />;
}

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  return (
    <Suspense>
      <ChatSessionContent params={params} />
    </Suspense>
  );
}
