import type { ToolbarFilterConfig } from "@/components/data-grid";
import type { WorkspaceMember } from "./resume-library-page-model";

interface JobDescriptionOption {
  departmentName: string | null;
  evaluationMode: "legacy" | "structured";
  id: string;
  name: string;
}

interface SkillSuggestion {
  count: number;
  skill: string;
}

export function buildResumeLibraryFiltersConfig({
  jobDescriptions,
  selectedStructuredJob,
  skillSuggestions,
  workspaceMembers,
}: {
  jobDescriptions: JobDescriptionOption[];
  selectedStructuredJob: JobDescriptionOption | undefined;
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
    ...(selectedStructuredJob
      ? [
          {
            clearable: true,
            key: "structuredMinScore" as const,
            options: [60, 75, 85, 90].map((score) => ({
              label: `最低 ${score} 分`,
              value: String(score),
            })),
            placeholder: "最低综合分",
            type: "select" as const,
          },
          {
            clearable: true,
            key: "structuredMaxScore" as const,
            options: [60, 75, 85, 90].map((score) => ({
              label: `最高 ${score} 分`,
              value: String(score),
            })),
            placeholder: "最高综合分",
            type: "select" as const,
          },
        ]
      : []),
  ];
}
