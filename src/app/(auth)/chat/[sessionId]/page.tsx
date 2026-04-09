import { cacheLife } from 'next/cache';
import ChatPageClient from '@/app/(auth)/chat/_components/chat-page-client';

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  'use cache';
  cacheLife('max');

  const { sessionId } = await params;

  return <ChatPageClient initialSessionId={sessionId} key={sessionId} />;
}
