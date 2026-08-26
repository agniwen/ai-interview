import { pipelineStageMeta } from "@arc/db-schema/studio-interviews";
import { VISIBLE_PIPELINE_STAGES } from "./resume-library-page-model";
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
    { key: "textFilters" as const, resource: "resumes" as const, type: "text-filters" as const },
    {
      key: "stage",
      label: "招聘阶段",
      options: VISIBLE_PIPELINE_STAGES.map((stage) => ({
        label: pipelineStageMeta[stage].label,
        value: stage,
      })),
      type: "select" as const,
    },
    {
      emptyMessage: "没有匹配的创建人",
      key: "creatorIds" as const,
      label: "创建人",
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
      label: "技能",
      match: "all" as const,
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
      label: "关联岗位",
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
      label: "AI 评价",
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
