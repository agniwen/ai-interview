import { describe, expect, it } from "vitest";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { buildJobDescriptionSemanticTexts, buildResumeSemanticTexts } from "./text-builders";
import { hashResumeProfileForSemanticIndex } from "./profile-hash";

const baseProfile: ResumeProfile = {
  age: null,
  educationExperiences: [
    {
      degree: "学士",
      educationLevel: "本科",
      graduationYear: "2021",
      major: "计算机科学",
      period: "2017-2021",
      school: "浙江大学",
      summary: null,
    },
  ],
  email: "candidate@example.com",
  gender: "未发现信息",
  name: "张三",
  personalStrengths: ["工程化经验", "复杂项目推进"],
  phone: "13800000000",
  projectExperiences: [
    {
      name: "招聘系统重构",
      period: "2023-2024",
      role: "后端负责人",
      summary: "负责简历解析、候选人推荐和性能优化。",
      techStack: ["TypeScript", "PostgreSQL", "Redis"],
    },
  ],
  schools: ["浙江大学"],
  skills: ["TypeScript", "React", "PostgreSQL"],
  targetRoles: ["全栈工程师"],
  workExperiences: [
    {
      company: "阿里巴巴",
      period: "2021-2024",
      role: "高级前端工程师",
      summary: "负责招聘 SaaS 的候选人管理和数据看板。",
    },
  ],
  workYears: 3,
};

describe("buildResumeSemanticTexts", () => {
  it("builds three semantic chunks and filters placeholder values", () => {
    const chunks = buildResumeSemanticTexts(baseProfile);

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.chunkType)).toEqual([
      "resume_overview",
      "work_project",
      "skill_role",
    ]);
    expect(chunks[0]?.text).toContain("候选人：张三");
    expect(chunks[0]?.text).toContain("学校：浙江大学");
    expect(chunks[0]?.text).not.toContain("未发现信息");
    expect(chunks[1]?.text).toContain("阿里巴巴");
    expect(chunks[1]?.text).toContain("招聘系统重构");
    expect(chunks[2]?.text).toContain("TypeScript");
    expect(chunks[2]?.text).toContain("全栈工程师");
  });
});

describe("buildJobDescriptionSemanticTexts", () => {
  it("从 JD 生成 3 个 chunk，覆盖 name/department/description/prompt", () => {
    const chunks = buildJobDescriptionSemanticTexts({
      departmentName: "算法组",
      description: "负责推荐系统",
      id: "jd-1",
      name: "推荐算法工程师",
      prompt: "考察向量检索经验",
    });
    expect(chunks.map((c) => c.chunkType)).toEqual([
      "resume_overview",
      "work_project",
      "skill_role",
    ]);
    expect(chunks[0].text).toContain("推荐算法工程师");
    expect(chunks[0].text).toContain("算法组");
    expect(chunks[2].text).toContain("考察向量检索经验");
  });

  it("description/prompt 全空时 work_project chunk 仍为非空 header(不产生空串)", () => {
    const chunks = buildJobDescriptionSemanticTexts({
      departmentName: null,
      description: null,
      id: "jd-2",
      name: "产品经理",
      prompt: "",
    });
    const workProject = chunks.find((c) => c.chunkType === "work_project");
    expect(workProject?.text).toBe("## 职责和业务场景");
    expect(workProject?.text).not.toBe("");
  });
});

describe("hashResumeProfileForSemanticIndex", () => {
  it("returns the same hash for equivalent profiles with different array ordering noise", () => {
    const reordered: ResumeProfile = {
      ...baseProfile,
      schools: ["浙江大学", "浙江大学"],
      skills: ["PostgreSQL", "TypeScript", "React", "React"],
      targetRoles: ["全栈工程师"],
    };

    expect(hashResumeProfileForSemanticIndex(baseProfile)).toBe(
      hashResumeProfileForSemanticIndex(reordered),
    );
  });
});
