import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";

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
      name: "招聘系统",
      period: null,
      role: null,
      summary: null,
      techStack: ["React"],
    },
  ],
  schools: [],
  skills: ["TypeScript"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: null,
} satisfies ResumeProfile;

describe("Desktop resume overview profile", () => {
  it("renders work and project experiences from newest to oldest", () => {
    const html = renderToStaticMarkup(
      <ResumeProfileView
        profile={{
          ...profile,
          projectExperiences: [
            {
              name: "早期项目",
              period: "2019.01-2020.01",
              role: null,
              summary: null,
              techStack: [],
            },
            {
              name: "当前项目",
              period: "2024.06-至今",
              role: null,
              summary: null,
              techStack: [],
            },
            {
              name: "近期项目",
              period: "2022.03-2024.05",
              role: null,
              summary: null,
              techStack: [],
            },
          ],
          workExperiences: [
            {
              company: "早期公司",
              period: "2018.01-2020.01",
              role: "早期职位",
              summary: null,
            },
            {
              company: "当前公司",
              period: "2024.06-至今",
              role: "当前职位",
              summary: null,
            },
            {
              company: "近期公司",
              period: "2021.01-2024.05",
              role: "近期职位",
              summary: null,
            },
          ],
        }}
      />,
    );

    expect(html.indexOf("当前公司")).toBeLessThan(html.indexOf("近期公司"));
    expect(html.indexOf("近期公司")).toBeLessThan(html.indexOf("早期公司"));
    expect(html.indexOf("当前项目")).toBeLessThan(html.indexOf("近期项目"));
    expect(html.indexOf("近期项目")).toBeLessThan(html.indexOf("早期项目"));
  });

  it("places education after work experience and before skills", () => {
    const html = renderToStaticMarkup(<ResumeProfileView profile={profile} />);

    expect(html.indexOf("工作经历")).toBeLessThan(html.indexOf("教育经历"));
    expect(html.indexOf("教育经历")).toBeLessThan(html.indexOf("掌握技能"));
  });

  it("can omit target roles when they are displayed with candidate information", () => {
    const html = renderToStaticMarkup(
      <ResumeProfileView profile={profile} showTargetRoles={false} />,
    );

    expect(html).not.toContain("求职意向");
  });
});
