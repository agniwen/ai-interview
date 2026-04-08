import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'AI 面试 · 快速开始',
  description: '上传候选人简历，立即开始一场 AI 语音面试。',
};

export default async function InterviewQuickStartPage() {
  redirect('/studio/interviews');
}
