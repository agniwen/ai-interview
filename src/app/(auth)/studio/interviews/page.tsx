import type { Metadata } from 'next';
import { connection } from 'next/server';
import { InterviewManagementPage } from '@/app/(auth)/studio/interviews/_components/interview-management-page';
import { listStudioInterviewRecords } from '@/server/queries/studio-interviews';

export const metadata: Metadata = {
  title: 'AI 面试管理',
};

export default async function StudioInterviewsPage() {
  await connection();
  const initialData = await listStudioInterviewRecords();

  return <InterviewManagementPage initialData={initialData} />;
}
