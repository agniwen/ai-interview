import { describe, expect, it } from "vitest";
import {
  formatResumeExperienceDescription,
  parseResumeEmploymentPeriod,
  toWorkExperienceItems,
} from "@/components/features/resume/resume-profile-view";

describe("resume profile work experience helpers", () => {
  it("adapts resume work experiences to the registry WorkExperience data shape", () => {
    const items = toWorkExperienceItems([
      {
        company: "字节跳动",
        period: "2022.01 - 至今",
        role: "前端工程师",
        summary: "- 负责招聘系统\n- 推动组件复用",
      },
      {
        company: "未发现信息",
        period: "2020.01 - 2021.12",
        role: "开发工程师",
        summary: "负责后台管理",
      },
      {
        company: "字节跳动",
        period: "2021.01 - 2021.12",
        role: "实习生",
        summary: "参与组件库建设",
      },
    ]);

    expect(items).toEqual([
      {
        companyName: "字节跳动",
        id: "company-0",
        isCurrentEmployer: true,
        positions: [
          {
            description: "- 负责招聘系统\n- 推动组件复用",
            employmentPeriod: { start: "01.2022" },
            id: "company-0-position-0",
            isExpanded: true,
            title: "前端工程师",
          },
          {
            description: "- 参与组件库建设",
            employmentPeriod: { end: "12.2021", start: "01.2021" },
            id: "company-0-position-1",
            isExpanded: false,
            title: "实习生",
          },
        ],
      },
      {
        companyName: "未发现公司",
        id: "company-1",
        isCurrentEmployer: false,
        positions: [
          {
            description: "- 负责后台管理",
            employmentPeriod: { end: "12.2021", start: "01.2020" },
            id: "company-1-position-0",
            isExpanded: true,
            title: "开发工程师",
          },
        ],
      },
    ]);
  });

  it("formats plain resume summaries as markdown lists for WorkExperience", () => {
    expect(formatResumeExperienceDescription("负责A。负责B；负责C")).toBe(
      "- 负责A\n- 负责B\n- 负责C",
    );
    expect(formatResumeExperienceDescription("- 已经是列表\n- 保持不变")).toBe(
      "- 已经是列表\n- 保持不变",
    );
  });

  it("normalizes common Chinese resume periods for WorkExperience duration parsing", () => {
    expect(parseResumeEmploymentPeriod("2020年3月 - 2022年6月")).toEqual({
      end: "06.2022",
      start: "03.2020",
    });
    expect(parseResumeEmploymentPeriod("03.2024 — 至今")).toEqual({ start: "03.2024" });
  });
});
