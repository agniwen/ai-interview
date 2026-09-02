import type { ToolbarFilterConfig } from "@/components/features/data-grid";
import { DateRangeFilterEditor } from "@/components/features/data-grid/parts/date-range-filter";
import { dateRangeFilterLabel } from "@app/shared/date-range-filter";
import type {
  RecruitingJobDescriptionOption,
  SkillSuggestion,
  WorkspaceMemberOption,
} from "@/lib/client/studio-resumes";

export function buildResumeLibraryFiltersConfig({
  jobDescriptions,
  skillSuggestions,
  workspaceMembers,
}: {
  jobDescriptions: RecruitingJobDescriptionOption[];
  skillSuggestions: SkillSuggestion[];
  workspaceMembers: WorkspaceMemberOption[];
}): ToolbarFilterConfig[] {
  return [
    { key: "textFilters", resource: "resumes" as const, type: "text-filters" as const },
    {
      editor: DateRangeFilterEditor,
      formatValue: (value) => dateRangeFilterLabel(value, "创建时间"),
      key: "createdAtRange",
      label: "创建时间",
      operator: { label: "在", value: "is" },
      type: "custom",
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
      key: "recommendationLevels",
      label: "AI 评价",
      options: [
        { label: "非常推荐", value: "highly_recommended" },
        { label: "推荐", value: "recommended" },
        { label: "待定", value: "undecided" },
        { label: "不推荐", value: "not_recommended" },
      ],
      placeholder: "按 AI 评价筛选",
      selectedFormat: (count: number) => `已选 ${count} 个评价等级`,
      type: "multi-select",
    },
  ];
}
