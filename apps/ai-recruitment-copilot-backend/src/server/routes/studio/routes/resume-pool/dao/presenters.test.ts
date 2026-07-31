import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { describe, expect, it } from "vitest";

import { buildProfileHighlights } from "./presenters";

const profile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "测试候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [
    {
      name: "旧版招聘后台",
      period: "2022.01-2022.08",
      role: "开发工程师",
      summary: "负责旧版招聘后台。",
      techStack: ["Vue"],
    },
    {
      name: "智能招聘看板",
      period: "2025.01-2025.05",
      role: "负责人",
      summary: "负责候选人数据分析与可视化。",
      techStack: ["React"],
    },
  ],
  schools: [],
  skills: [],
  targetRoles: [],
  workExperiences: [
    {
      company: "启明星科技",
      period: "2021.03-2023.12",
      role: "开发工程师",
      summary: "负责企业管理系统。",
    },
    {
      company: "极光矩阵",
      period: "2025.02-至今",
      role: "前端工程师",
      summary: "负责 AI 招聘产品前端。",
    },
  ],
  workYears: null,
} satisfies ResumeProfile;

describe("buildProfileHighlights", () => {
  it("includes details for the latest company and project when experiences are unordered", () => {
    const highlights = buildProfileHighlights(profile);

    expect(highlights.latestCompanyDetail).toEqual({
      period: "2025.02-至今",
      role: "前端工程师",
      summary: "负责 AI 招聘产品前端。",
    });
    expect(highlights.latestProjectDetail).toEqual({
      period: "2025.01-2025.05",
      role: "负责人",
      summary: "负责候选人数据分析与可视化。",
    });
  });
});
