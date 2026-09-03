import type { ResumeProfile } from "@app/db-schema/interview/types";

export const PROFILE: ResumeProfile = {
  age: null,
  email: "candidate@example.com",
  gender: null,
  name: "候选人甲",
  personalStrengths: ["沟通清晰"],
  phone: "13800138000",
  projectExperiences: [],
  schools: [],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: 5,
};

export const PROFILE_WITH_HIGHLIGHTS: ResumeProfile = {
  ...PROFILE,
  projectExperiences: [
    {
      name: "智能招聘看板",
      period: "2025.01-2025.05",
      role: "负责人",
      summary: "负责候选人数据分析与可视化。",
      techStack: ["React"],
    },
    {
      name: "旧项目",
      period: "2024.01-2024.05",
      role: "成员",
      summary: "历史项目。",
      techStack: [],
    },
  ],
  schools: ["华南农业大学", "长沙理工大学"],
  workExperiences: [
    {
      company: "极光矩阵",
      period: "2025.02-至今",
      role: "前端工程师",
      summary: "负责 AI 招聘产品前端。",
    },
    {
      company: "旧公司",
      period: "2023.01-2024.01",
      role: "实习生",
      summary: "历史经历。",
    },
  ],
};
