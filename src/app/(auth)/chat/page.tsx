import type { Metadata } from 'next';
import ChatPageClient from '@/app/chat/_components/chat-page-client';

export const metadata: Metadata = {
  title: '简历筛选助手',
  description: '支持上传候选人简历、整理筛选要求，并生成聊天式初筛建议。',
};

export default function ChatPage() {
  return <ChatPageClient initialSessionId={null} key='new-chat' />;
}
