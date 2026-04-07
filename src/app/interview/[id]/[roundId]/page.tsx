import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import InterviewPageClient from '@/app/interview/_components/interview-page-client';

export const metadata: Metadata = {
  title: 'AI 面试',
  description: '根据候选人专属链接发起语音面试，并实时查看追问过程与作答记录。',
};

export default async function InterviewRoundPage({
  params,
}: {
  params: Promise<{ id: string, roundId: string }>
}) {
  'use cache';
  cacheLife('max');

  const { id, roundId } = await params;

  return <InterviewPageClient interviewId={id} roundId={roundId} />;
}
