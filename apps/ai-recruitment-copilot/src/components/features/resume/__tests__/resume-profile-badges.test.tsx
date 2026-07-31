import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { WorkExperience } from "@/components/features/resume/work-experience";

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

describe("resume profile badges", () => {
  it("renders profile chips with the shared Badge component", () => {
    const html = renderToStaticMarkup(<ResumeProfileView profile={profile} />);

    expect(html.match(/data-slot="badge"/g)).toHaveLength(3);
    expect(html).not.toContain("rounded-full bg-muted");
  });

  it("renders work-experience skills with the shared Badge component", () => {
    const html = renderToStaticMarkup(
      <WorkExperience
        experiences={[
          {
            companyName: "测试公司",
            id: "company-1",
            positions: [
              {
                employmentPeriod: { end: "2024", start: "2023" },
                id: "position-1",
                skills: ["React"],
                title: "前端工程师",
              },
            ],
          },
        ]}
      />,
    );

    expect(html.match(/data-slot="badge"/g)).toHaveLength(1);
  });
});
