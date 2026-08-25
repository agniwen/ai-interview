import type { ToolbarFilterConfig } from "@/components/data-grid";
import type { WorkspaceMember } from "./resume-library-page-model";

interface JobDescriptionOption {
  departmentName: string | null;
  evaluationMode: "legacy" | "qualitative" | "structured";
  id: string;
  name: string;
}

interface SkillSuggestion {
  count: number;
  skill: string;
}

export function buildResumeLibraryFiltersConfig({
  jobDescriptions,
  skillSuggestions,
  workspaceMembers,
}: {
  jobDescriptions: JobDescriptionOption[];
  skillSuggestions: SkillSuggestion[];
  workspaceMembers: WorkspaceMember[];
}): ToolbarFilterConfig[] {
  return [
    {
      key: "search" as const,
      minWidth: "15rem",
      placeholder: "搜索候选人、邮箱、电话、简历名或目标岗位",
      type: "search" as const,
    },
    {
      emptyMessage: "没有匹配的创建人",
      key: "creatorIds" as const,
      options: workspaceMembers.map((member) => ({
        avatarUrl: member.image,
        label: member.name,
        searchValue: `${member.name} ${member.email}`,
        value: member.id,
      })),
      placeholder: "按创建人筛选",
      searchPlaceholder: "搜索姓名或邮箱…",
      selectedFormat: (count: number) => `已选 ${count} 个创建人`,
      type: "multi-select" as const,
    },
    {
      emptyMessage: "没有匹配的技能",
      key: "skills" as const,
      options: skillSuggestions.map((item) => ({
        description: `${item.count} 位候选人`,
        label: item.skill,
        value: item.skill,
      })),
      placeholder: "按技能筛选（需同时具备）",
      searchPlaceholder: "搜索技能…",
      selectedFormat: (count: number) => `已选 ${count} 个技能（同时具备）`,
      type: "multi-select" as const,
    },
    {
      emptyMessage: "没有匹配的岗位",
      key: "jdIds" as const,
      options: jobDescriptions.map((jd) => ({
        label: jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name,
        value: jd.id,
      })),
      placeholder: "按关联岗位筛选",
      searchPlaceholder: "搜索岗位或部门…",
      selectedFormat: (count: number) => `已选 ${count} 个岗位`,
      type: "multi-select" as const,
    },
    {
      emptyMessage: "没有匹配的评价等级",
      key: "recommendationLevels" as const,
      options: [
        { label: "非常推荐", value: "highly_recommended" },
        { label: "推荐", value: "recommended" },
        { label: "待定", value: "undecided" },
        { label: "不推荐", value: "not_recommended" },
      ],
      placeholder: "按 AI 评价筛选",
      selectedFormat: (count: number) => `已选 ${count} 个评价等级`,
      type: "multi-select" as const,
    },
  ];
}
