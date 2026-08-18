import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandidateCareerSummary, sortCareerWorkExperiences } from "./candidate-career-summary";

type WorkExperience = ResumeProfile["workExperiences"][number];

function work(company: string, period: string): WorkExperience {
  return { company, period, role: `${company}岗位`, summary: null };
}

describe("CandidateCareerSummary", () => {
  it("sorts work from the current or most recent company to the earliest company", () => {
    const experiences = [
      work("第一家公司", "2017.03 - 2019.06"),
      work("最近完成的公司", "2022.01 - 2024.08"),
      work("当前公司", "2024.09 - 至今"),
      work("时间未知的公司", "未发现信息"),
    ];

    expect(sortCareerWorkExperiences(experiences).map((item) => item.company)).toEqual([
      "当前公司",
      "最近完成的公司",
      "第一家公司",
      "时间未知的公司",
    ]);
    expect(experiences.map((item) => item.company)).toEqual([
      "第一家公司",
      "最近完成的公司",
      "当前公司",
      "时间未知的公司",
    ]);
  });

  it("renders the requested work and education fields without inventing missing values", () => {
    const profile: ResumeProfile = {
      age: null,
      educationExperiences: [
        {
          degree: "学士",
          educationLevel: "本科",
          graduationYear: null,
          major: "软件工程",
          period: "2019.09 - 2022.06",
          school: "内蒙古科技大学",
          summary: null,
        },
      ],
      email: null,
      gender: null,
      name: "候选人",
      personalStrengths: [],
      phone: null,
      projectExperiences: [],
      schools: [],
      skills: [],
      targetRoles: [],
      workExperiences: [work("示例公司", "2022.07 - 至今")],
      workYears: null,
    };

    const markup = renderToStaticMarkup(<CandidateCareerSummary profile={profile} />);

    expect(markup).toContain("示例公司岗位");
    expect(markup).toContain("2022.07 - 至今");
    expect(markup).toContain("示例公司");
    expect(markup).toContain("2019.09 - 2022.06");
    expect(markup).toContain("内蒙古科技大学（本科）");
    expect(markup).toContain("软件工程");
    expect(markup).toContain("tabler-icon-briefcase-2");
    expect(markup).toContain("tabler-icon-school");
    expect(markup).not.toContain('data-slot="badge"');
    expect(markup).toMatch(/text-muted-foreground text-xs">示例公司岗位/);
    expect(markup).toMatch(/text-muted-foreground text-xs">软件工程/);
    expect(markup.indexOf("示例公司")).toBeLessThan(markup.indexOf("示例公司岗位"));
    expect(markup.indexOf("内蒙古科技大学（本科）")).toBeLessThan(markup.indexOf("软件工程"));
  });
});
