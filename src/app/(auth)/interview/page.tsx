import type { Metadata } from 'next';
import InterviewQuickStartClient from '@/app/(auth)/interview/_components/interview-quick-start-client';

export const metadata: Metadata = {
  title: 'AI 面试 · 快速开始',
  description: '上传候选人简历，立即开始一场 AI 语音面试。',
};

export default async function InterviewQuickStartPage() {
  'use cache';
  return <InterviewQuickStartClient />;
}
