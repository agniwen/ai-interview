import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import {
  buildResumeProfileSnapshot,
  buildResumeProfileSnapshotFromProfile,
} from "./resume-profile-snapshot";

const PROFILE: ResumeProfile = {
  age: null,
  educationExperiences: [
    {
      degree: null,
      educationLevel: "硕士",
      graduationYear: "2020",
      major: "计算机",
      period: "2017.09 - 2020.06",
      school: "清华大学",
      summary: null,
    },
    {
      degree: null,
      educationLevel: "本科",
      graduationYear: "2017",
      major: "软件工程",
      period: "2013.09 - 2017.06",
      school: "浙江大学",
      summary: null,
    },
    {
      degree: null,
      educationLevel: "高中",
      graduationYear: "2013",
      major: null,
      period: "2010 - 2013",
      school: "杭州高中",
      summary: null,
    },
  ],
  email: "zhang@example.com",
  gender: null,
  name: "张三",
  personalStrengths: [],
  phone: "13800000000",
  projectExperiences: [
    {
      name: "项目D",
      period: "2020.01 - 2020.12",
      role: "开发",
      summary: null,
      techStack: [],
    },
    {
      name: "项目A",
      period: "2024.01 - 至今",
      role: "负责人",
      summary: null,
      techStack: [],
    },
    {
      name: "项目B",
      period: "2022.01 - 2023.12",
      role: "开发",
      summary: null,
      techStack: [],
    },
    {
      name: "项目C",
      period: "2021.01 - 2021.12",
      role: "实习生",
      summary: null,
      techStack: [],
    },
  ],
  schools: [],
  skills: [],
  targetRoles: [],
  workExperiences: [
    {
      company: "公司A",
      period: "2023.01 - 至今",
      role: "高级工程师",
      summary: null,
    },
    {
      company: "公司B",
      period: "2021.01 - 2022.12",
      role: "工程师",
      summary: null,
    },
    {
      company: "公司C",
      period: "2019.01 - 2020.12",
      role: "初级工程师",
      summary: null,
    },
    {
      company: "公司D",
      period: "2018.01 - 2018.12",
      role: "实习",
      summary: null,
    },
  ],
  workYears: 5,
};

describe("buildResumeProfileSnapshotFromProfile", () => {
  it("keeps recent 3 companies, 2 education rows, and 3 projects for dedup cards", () => {
    const snapshot = buildResumeProfileSnapshotFromProfile(PROFILE);

    expect(snapshot.work).toHaveLength(3);
    expect(snapshot.work.map((line) => line.primary)).toEqual(["公司A", "公司B", "公司C"]);
    expect(snapshot.workHasMore).toBe(true);

    expect(snapshot.education).toHaveLength(2);
    expect(snapshot.education.map((line) => line.primary)).toEqual([
      "清华大学（硕士）",
      "浙江大学（本科）",
    ]);
    expect(snapshot.educationHasMore).toBe(true);

    expect(snapshot.projects).toHaveLength(3);
    expect(snapshot.projects.map((line) => line.primary)).toEqual(["项目A", "项目B", "项目C"]);
    expect(snapshot.projectsHasMore).toBe(true);
  });

  it("returns an empty snapshot for null profiles", () => {
    expect(buildResumeProfileSnapshotFromProfile(null)).toEqual({
      education: [],
      educationHasMore: false,
      projects: [],
      projectsHasMore: false,
      work: [],
      workHasMore: false,
    });
  });
});

describe("buildResumeProfileSnapshot", () => {
  it("keeps the library list projection compact and includes the recent 3 projects", () => {
    const snapshot = buildResumeProfileSnapshot({
      resumeEducationExperiences: PROFILE.educationExperiences,
      resumeEducationGraduationYear: null,
      resumeEducationLevel: null,
      resumeEducationMajor: null,
      resumeEducationPeriod: null,
      resumeEducationSchool: null,
      resumeProjectExperiences: PROFILE.projectExperiences,
      resumeSchool: null,
      resumeWorkCompany: null,
      resumeWorkExperiences: PROFILE.workExperiences,
      resumeWorkPeriod: null,
      resumeWorkRole: null,
    });

    expect(snapshot.work).toHaveLength(3);
    expect(snapshot.education).toHaveLength(3);
    expect(snapshot.educationHasMore).toBe(false);
    expect(snapshot.projects.map((line) => line.primary)).toEqual(["项目A", "项目B", "项目C"]);
    expect(snapshot.projectsHasMore).toBe(true);
  });
});
