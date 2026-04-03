import type { Metadata } from 'next';
import { InterviewManagementPage } from '@/app/studio/(auth)/interviews/_components/interview-management-page';
import { listStudioInterviewRecords } from '@/server/queries/studio-interviews';

export const metadata: Metadata = {
  title: 'AI 面试管理',
};

export default async function StudioInterviewsPage() {
  const initialRecords = await listStudioInterviewRecords();

  return <InterviewManagementPage initialRecords={initialRecords} />;
}
