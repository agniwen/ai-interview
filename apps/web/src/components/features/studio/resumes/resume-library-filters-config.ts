import type { ToolbarFilterConfig } from "@/components/features/data-grid";
import { DateRangeFilterEditor } from "@/components/features/data-grid/parts/date-range-filter";
import { dateRangeFilterLabel } from "@app/shared/date-range-filter";
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
      key: "pipelineStages",
      label: "流程阶段",
      options: [
        { label: "简历筛选", value: "screening" },
        { label: "AI 初面", value: "ai_interview" },
        { label: "真人复面", value: "second_interview" },
        { label: "真人终面", value: "final_interview" },
        { label: "流水提供", value: "income_proof" },
        { label: "谈薪", value: "salary_negotiation" },
        { label: "发 Offer", value: "offer" },
        { label: "背调", value: "background_check" },
        { label: "入职办理", value: "onboarding" },
        { label: "已结束", value: "closed" },
      ],
      placeholder: "按流程阶段筛选",
      selectedFormat: (count: number) => `已选 ${count} 个阶段`,
      type: "multi-select",
    },
    {
      key: "outcomes",
      label: "招聘结果",
      options: [
        { label: "推进中", value: "in_pipeline" },
        { label: "已入职", value: "hired" },
        { label: "已淘汰", value: "rejected" },
        { label: "已撤回", value: "withdrawn" },
        { label: "已归档", value: "archived" },
      ],
      placeholder: "按招聘结果筛选",
      selectedFormat: (count: number) => `已选 ${count} 个结果`,
      type: "multi-select",
    },
    {
      key: "nodeStatuses",
      label: "节点状态",
      options: [
        { label: "待处理", value: "pending" },
        { label: "已安排", value: "scheduled" },
        { label: "进行中", value: "in_progress" },
        { label: "待评价", value: "awaiting_review" },
        { label: "谈薪中", value: "negotiating" },
        { label: "待发 Offer", value: "awaiting_send" },
        { label: "待回复", value: "awaiting_response" },
        { label: "已完成", value: "completed" },
        { label: "已跳过", value: "skipped" },
      ],
      placeholder: "按当前节点状态筛选",
      selectedFormat: (count: number) => `已选 ${count} 个状态`,
      type: "multi-select",
    },
    {
      key: "nodeResults",
      label: "节点结果",
      options: [
        { label: "合格 / 通过", value: "pass" },
        { label: "淘汰 / 未通过", value: "fail" },
        { label: "放弃", value: "withdrawn" },
      ],
      placeholder: "按当前节点结果筛选",
      selectedFormat: (count: number) => `已选 ${count} 个结果`,
      type: "multi-select",
    },
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
