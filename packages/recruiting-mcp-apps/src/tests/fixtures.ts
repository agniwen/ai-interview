import type {
  McpCandidateCard,
  McpCandidateDetailCard,
  McpCandidateListCard,
} from "@app/shared/recruiting-mcp-cards";

export const candidate: McpCandidateCard = {
  education: [{ period: "2014-2018", primary: "浙江大学", secondary: "计算机科学" }],
  experience: [{ period: "2021-至今", primary: "某科技公司", secondary: "高级前端工程师" }],
  id: "resume-1",
  jobName: "前端工程师",
  name: "张妍",
  outcome: null,
  recommendation: { label: "推荐", value: "recommended" },
  skills: ["React", "TypeScript"],
  stage: { label: "复试", value: "second_interview" },
  summary: "五年 React 经验，主导过设计系统建设。",
  targetRole: "前端工程师",
  updatedAt: "2026-10-20T08:00:00.000Z",
  url: "https://hire.example.com/w/acme/studio/resumes/resume-1",
};

export const listCard: McpCandidateListCard = {
  candidates: [candidate, { ...candidate, id: "resume-2", name: "李雷", recommendation: null }],
  kind: "candidate_list",
  page: 1,
  pageSize: 2,
  total: 5,
};

export const detailCard: McpCandidateDetailCard = {
  candidate: {
    ...candidate,
    email: "zhangyan@example.com",
    phone: "13800000000",
    recruiterAssessment: "沟通清晰，期望薪资在预算内。",
    workYears: 5,
  },
  kind: "candidate_detail",
};
