import type { ToolbarFilterConfig } from "@/components/data-grid";
import { PIPELINE_STAGE_TABS } from "./resume-library-filter-model";
import type {
  RecruitingJobDescriptionOption,
  SkillSuggestion,
  WorkspaceMemberOption,
} from "@/lib/client/studio-resumes";

export function buildResumeLibraryFiltersConfig({
  jobDescriptions,
  selectedStructuredJob,
  skillSuggestions,
  workspaceMembers,
}: {
  jobDescriptions: RecruitingJobDescriptionOption[];
  selectedStructuredJob: RecruitingJobDescriptionOption | undefined;
  skillSuggestions: SkillSuggestion[];
  workspaceMembers: WorkspaceMemberOption[];
}): ToolbarFilterConfig[] {
  return [
    { key: "textFilters", resource: "resumes" as const, type: "text-filters" as const },
    {
      key: "stage",
      label: "招聘阶段",
      options: PIPELINE_STAGE_TABS.filter((stage) => stage.value !== "all").map(
        ({ label, value }) => ({ label, value }),
      ),
      type: "select",
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
