import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { SyntheticResumeReviewCase } from "./types";

const education: NonNullable<ResumeProfile["educationExperiences"]>[number] = {
  degree: "学士",
  educationLevel: "本科",
  graduationYear: "2020",
  major: "计算机科学",
  period: "2016-2020",
  school: "合成大学",
  summary: null,
};

function profile(overrides: Partial<ResumeProfile>): ResumeProfile {
  return {
    age: null,
    educationExperiences: [education],
    email: null,
    gender: null,
    name: "合成候选人",
    personalStrengths: [],
    phone: null,
    projectExperiences: [],
    schools: ["合成大学"],
    skills: [],
    targetRoles: [],
    workExperiences: [],
    workYears: null,
    ...overrides,
  };
}

export const SYNTHETIC_RESUME_REVIEW_CASES: SyntheticResumeReviewCase[] = [
  {
    expectations: {
      allowedActions: ["interview", "hold"],
      dimensionBands: {
        educationBackground: { max: 90, min: 80 },
        experienceRelevance: { max: 95, min: 75 },
        potential: { max: 90, min: 65 },
        projectMatch: { max: 95, min: 70 },
        skillMatch: { max: 100, min: 80 },
        stability: { max: 90, min: 55 },
      },
      rationaleTerms: {
        experienceRelevance: ["5年", "5 年", "前端"],
        projectMatch: ["交易平台", "核心模块"],
        skillMatch: ["React", "TypeScript"],
      },
    },
    id: "strong-frontend-match",
    jobDescription:
      "招聘中高级前端工程师，要求 4 年以上前端经验，熟练使用 React、TypeScript，具备复杂业务系统交付经验。",
    name: "核心技能和项目直接匹配",
    resumeProfile: profile({
      personalStrengths: ["负责复杂业务前端工程化"],
      projectExperiences: [
        {
          name: "交易平台",
          period: "2023-2025",
          role: "前端负责人",
          summary: "使用 React 与 TypeScript 交付交易核心模块并推进工程化改造",
          techStack: ["React", "TypeScript", "Vite"],
        },
      ],
      skills: ["React", "TypeScript", "Vite"],
      targetRoles: ["前端工程师"],
      workExperiences: [
        {
          company: "合成科技 A",
          period: "2020-2023",
          role: "前端工程师",
          summary: "负责业务系统开发",
        },
        {
          company: "合成科技 B",
          period: "2023-至今",
          role: "高级前端工程师",
          summary: "负责交易平台核心模块",
        },
      ],
      workYears: 5,
    }),
  },
  {
    expectations: {
      allowedActions: ["hold"],
      dimensionBands: {
        experienceRelevance: { max: 85, min: 65 },
        projectMatch: { max: 85, min: 60 },
        skillMatch: { max: 70, min: 45 },
      },
      rationaleTerms: {
        skillMatch: ["Vue", "JavaScript", "React"],
      },
    },
    id: "adjacent-frontend-stack",
    jobDescription: "招聘 React 前端工程师，要求 React、TypeScript 和中后台项目经验。",
    name: "相邻前端技术栈可迁移但缺少直接证据",
    resumeProfile: profile({
      projectExperiences: [
        {
          name: "运营后台",
          period: "2022-2025",
          role: "前端开发",
          summary: "使用 Vue 和 JavaScript 负责运营后台开发",
          techStack: ["Vue", "JavaScript"],
        },
      ],
      skills: ["Vue", "JavaScript"],
      targetRoles: ["前端工程师"],
      workExperiences: [
        {
          company: "合成科技 C",
          period: "2021-2025",
          role: "前端工程师",
          summary: "使用 Vue 和 JavaScript 持续负责运营后台开发与交付",
        },
      ],
      workYears: 4,
    }),
  },
  {
    expectations: {
      allowedActions: ["interview", "hold"],
      dimensionBands: {
        educationBackground: { max: 60, min: 45 },
        experienceRelevance: { max: 65, min: 45 },
        stability: { max: 60, min: 45 },
      },
      rationaleTerms: {
        educationBackground: ["待核实", "未提供"],
        stability: ["待核实", "未提供", "时间"],
      },
    },
    id: "missing-profile-evidence",
    jobDescription: "招聘前端工程师，要求本科、3 年以上经验，掌握 React。",
    name: "关键信息缺失但不能当作明确不满足",
    resumeProfile: profile({
      educationExperiences: [],
      schools: [],
      skills: [],
      targetRoles: ["前端工程师"],
      workYears: null,
    }),
  },
  {
    expectations: {
      allowedActions: ["hold", "reject"],
      dimensionBands: {
        experienceRelevance: { max: 30, min: 0 },
        potential: { max: 40, min: 25 },
        projectMatch: { max: 25, min: 0 },
      },
      rationaleTerms: {
        experienceRelevance: ["2年", "2 年", "资深", "经验"],
      },
    },
    id: "seniority-gap",
    jobDescription: "招聘资深前端架构师，要求 8 年以上经验、主导大型系统架构和跨团队技术治理。",
    name: "技能方向相关但资深职责证据明显不足",
    resumeProfile: profile({
      projectExperiences: [
        {
          name: "活动页面",
          period: "2024-2025",
          role: "前端开发",
          summary: "参与页面开发与组件维护",
          techStack: ["React", "JavaScript"],
        },
      ],
      skills: ["React", "JavaScript"],
      targetRoles: ["前端工程师"],
      workYears: 2,
    }),
  },
  {
    expectations: {
      allowedActions: ["interview", "hold"],
      dimensionBands: {
        experienceRelevance: { max: 75, min: 50 },
        potential: { max: 95, min: 85 },
        projectMatch: { max: 95, min: 60 },
        skillMatch: { max: 95, min: 65 },
      },
      rationaleTerms: {
        potential: ["独立", "成长", "学习", "负责"],
        projectMatch: ["组件库", "独立"],
      },
    },
    id: "high-potential-junior",
    jobDescription: "招聘初级前端工程师，要求具备 React 基础、学习能力和独立交付意识。",
    name: "年限较短但有清晰成长和独立交付证据",
    resumeProfile: profile({
      personalStrengths: ["持续学习并独立完成工具建设"],
      projectExperiences: [
        {
          name: "内部组件库",
          period: "2025",
          role: "主要开发者",
          summary: "独立完成 React 组件库首版并推动团队使用",
          techStack: ["React", "TypeScript"],
        },
      ],
      skills: ["React", "TypeScript"],
      targetRoles: ["初级前端工程师"],
      workYears: 1.5,
    }),
  },
  {
    expectations: {
      allowedActions: ["hold"],
      dimensionBands: {
        educationBackground: { max: 25, min: 15 },
        experienceRelevance: { max: 60, min: 45 },
        potential: { max: 60, min: 45 },
        projectMatch: { max: 60, min: 45 },
        skillMatch: { max: 80, min: 65 },
        stability: { max: 60, min: 45 },
      },
      rationaleTerms: {},
    },
    id: "blocking-screening-hold",
    jobDescription: "招聘前端工程师，岗位筛选规则要求本科及以上学历。",
    name: "明确 blocking 失败不得直接进入面试",
    resumeProfile: profile({
      educationExperiences: [
        {
          ...education,
          degree: null,
          educationLevel: "专科",
        },
      ],
      skills: ["React", "TypeScript"],
      targetRoles: ["前端工程师"],
      workYears: 4,
    }),
    screeningResult: {
      policyEmpty: false,
      policyEnabled: true,
      policyHash: "synthetic-blocking",
      policyVersion: 1,
      recommendation: "hold",
      ruleResults: [
        {
          evidence: [],
          label: "最低学历：本科",
          reason: "候选人学历未满足本科及以上要求。",
          ruleId: "education",
          severity: "blocking",
          status: "fail",
          type: "field",
        },
      ],
    },
  },
];
