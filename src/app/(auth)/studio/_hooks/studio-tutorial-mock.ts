import type { ScheduleEntryStatus, StudioInterviewListRecord } from '@/lib/studio-interviews';

const now = Date.now();

function mockEntry(id: string, roundLabel: string, scheduledAt: string, status: ScheduleEntryStatus) {
  return {
    id,
    interviewRecordId: '',
    roundLabel,
    scheduledAt,
    notes: null,
    status,
    conversationId: null,
    sortOrder: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

export const STUDIO_TUTORIAL_MOCK_RECORDS: StudioInterviewListRecord[] = [
  {
    id: 'tutorial-1',
    candidateName: '张三',
    candidateEmail: 'zhangsan@example.com',
    targetRole: '前端开发工程师',
    status: 'ready',
    resumeFileName: '张三_前端开发_简历.pdf',
    scheduleEntries: [
      mockEntry('s1', '一面', new Date(now + 86400_000).toISOString(), 'pending'),
    ],
    interviewLink: '/interview/tutorial-1/s1',
    notes: null,
    createdBy: 'admin',
    createdAt: new Date(now - 3600_000).toISOString(),
    updatedAt: new Date(now - 3600_000).toISOString(),
    questionCount: 8,
  },
  {
    id: 'tutorial-2',
    candidateName: '李四',
    candidateEmail: 'lisi@example.com',
    targetRole: '后端开发工程师',
    status: 'in_progress',
    resumeFileName: '李四_后端开发_简历.pdf',
    scheduleEntries: [
      { ...mockEntry('s2', '一面', new Date(now - 86400_000).toISOString(), 'completed'), sortOrder: 0 },
      { ...mockEntry('s3', '二面', new Date(now + 172800_000).toISOString(), 'pending'), sortOrder: 1 },
    ],
    interviewLink: '/interview/tutorial-2/s3',
    notes: null,
    createdBy: 'admin',
    createdAt: new Date(now - 86400_000).toISOString(),
    updatedAt: new Date(now - 7200_000).toISOString(),
    questionCount: 6,
  },
  {
    id: 'tutorial-3',
    candidateName: '王五',
    candidateEmail: 'wangwu@example.com',
    targetRole: '产品经理',
    status: 'completed',
    resumeFileName: '王五_产品经理_简历.pdf',
    scheduleEntries: [
      mockEntry('s4', 'HR 面', new Date(now - 172800_000).toISOString(), 'completed'),
    ],
    interviewLink: '/interview/tutorial-3/s4',
    notes: null,
    createdBy: 'admin',
    createdAt: new Date(now - 259200_000).toISOString(),
    updatedAt: new Date(now - 172800_000).toISOString(),
    questionCount: 5,
  },
];

export const STUDIO_TUTORIAL_MOCK_SEARCH = '前端开发';

export const STUDIO_TUTORIAL_MOCK_FORM = {
  candidateName: '张三',
  candidateEmail: 'zhangsan@example.com',
  targetRole: '前端开发工程师',
  status: 'ready' as const,
  notes: '来自内推渠道，3 年 React 经验，有大厂背景。',
};

export const STUDIO_TUTORIAL_MOCK_QUESTIONS = [
  { question: '请描述你在上一家公司最有挑战性的前端项目，你是如何解决核心技术难题的？', difficulty: 'hard' as const, order: 1 },
  { question: '谈谈你对 React Server Components 的理解，以及在实际项目中的应用场景。', difficulty: 'medium' as const, order: 2 },
  { question: '如何优化一个首屏加载时间超过 5 秒的单页应用？请列举具体手段。', difficulty: 'medium' as const, order: 3 },
  { question: '请解释 TypeScript 中泛型的使用场景，并举一个你实际使用过的例子。', difficulty: 'easy' as const, order: 4 },
];
