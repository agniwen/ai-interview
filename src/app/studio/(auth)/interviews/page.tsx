import type { Metadata } from 'next';
import { InterviewManagementPage } from '@/app/studio/(auth)/interviews/_components/interview-management-page';

export const metadata: Metadata = {
  title: 'AI 面试管理',
};

export default function StudioInterviewsPage() {
  return <InterviewManagementPage />;
}
