import type { ScheduleEntryStatus, StudioInterviewListRecord } from "@/lib/studio-interviews";

const now = Date.now();

function mockEntry(
  id: string,
  roundLabel: string,
  scheduledAt: string,
  status: ScheduleEntryStatus,
) {
  return {
    conversationId: null,
    createdAt: new Date(now).toISOString(),
    id,
    interviewRecordId: "",
    notes: null,
    roundLabel,
    scheduledAt,
    sortOrder: 0,
    status,
    updatedAt: new Date(now).toISOString(),
  };
}

export const STUDIO_TUTORIAL_MOCK_RECORDS: StudioInterviewListRecord[] = [
  {
    candidateEmail: "zhangsan@example.com",
    candidateName: "张三",
    createdAt: new Date(now - 3_600_000).toISOString(),
    createdBy: "admin",
    creatorName: "管理员",
    hasResumeFile: true,
    id: "tutorial-1",
    interviewLink: "/interview/tutorial-1/s1",
    jobDescriptionId: null,
    jobDescriptionName: null,
    notes: null,
    questionCount: 8,
    resumeFileName: "张三_前端开发_简历.pdf",
    scheduleEntries: [mockEntry("s1", "一面", new Date(now + 86_400_000).toISOString(), "pending")],
    status: "ready",
    targetRole: "前端开发工程师",
    updatedAt: new Date(now - 3_600_000).toISOString(),
  },
  {
    candidateEmail: "lisi@example.com",
    candidateName: "李四",
    createdAt: new Date(now - 86_400_000).toISOString(),
    createdBy: "admin",
    creatorName: "管理员",
    hasResumeFile: true,
    id: "tutorial-2",
    interviewLink: "/interview/tutorial-2/s3",
    jobDescriptionId: null,
    jobDescriptionName: null,
    notes: null,
    questionCount: 6,
    resumeFileName: "李四_后端开发_简历.pdf",
    scheduleEntries: [
      {
        ...mockEntry("s2", "一面", new Date(now - 86_400_000).toISOString(), "completed"),
        sortOrder: 0,
      },
      {
        ...mockEntry("s3", "二面", new Date(now + 172_800_000).toISOString(), "pending"),
        sortOrder: 1,
      },
    ],
    status: "in_progress",
    targetRole: "后端开发工程师",
    updatedAt: new Date(now - 7_200_000).toISOString(),
  },
  {
    candidateEmail: "wangwu@example.com",
    candidateName: "王五",
    createdAt: new Date(now - 259_200_000).toISOString(),
    createdBy: "admin",
    creatorName: "管理员",
    hasResumeFile: true,
    id: "tutorial-3",
    interviewLink: "/interview/tutorial-3/s4",
    jobDescriptionId: null,
    jobDescriptionName: null,
    notes: null,
    questionCount: 5,
    resumeFileName: "王五_产品经理_简历.pdf",
    scheduleEntries: [
      mockEntry("s4", "HR 面", new Date(now - 172_800_000).toISOString(), "completed"),
    ],
    status: "completed",
    targetRole: "产品经理",
    updatedAt: new Date(now - 172_800_000).toISOString(),
  },
];

export const STUDIO_TUTORIAL_MOCK_SEARCH = "前端开发";

export const STUDIO_TUTORIAL_MOCK_FORM = {
  candidateEmail: "zhangsan@example.com",
  candidateName: "张三",
  notes: "来自内推渠道，3 年 React 经验，有大厂背景。",
  status: "ready" as const,
  targetRole: "前端开发工程师",
};

export const STUDIO_TUTORIAL_MOCK_QUESTIONS = [
  {
    difficulty: "hard" as const,
    order: 1,
    question: "请描述你在上一家公司最有挑战性的前端项目，你是如何解决核心技术难题的？",
  },
  {
    difficulty: "medium" as const,
    order: 2,
    question: "谈谈你对 React Server Components 的理解，以及在实际项目中的应用场景。",
  },
  {
    difficulty: "medium" as const,
    order: 3,
    question: "如何优化一个首屏加载时间超过 5 秒的单页应用？请列举具体手段。",
  },
  {
    difficulty: "easy" as const,
    order: 4,
    question: "请解释 TypeScript 中泛型的使用场景，并举一个你实际使用过的例子。",
  },
];
