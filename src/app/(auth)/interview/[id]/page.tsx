import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import InterviewPageClient from '@/app/(auth)/interview/_components/interview-page-client';

export const metadata: Metadata = {
  title: 'AI 面试',
  description: '根据候选人专属链接发起语音面试，并实时查看追问过程与作答记录。',
};

export default async function InterviewByIdPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  'use cache';
  cacheLife('max');

  const { id } = await params;

  return <InterviewPageClient interviewId={id} />;
}
