/**
 * Desktop 招聘台筛选模型 — 与 web 端 `resume-library-page-model` / filters-config 对齐：
 * - 独立 stage tabs（隐藏 written_test，不参与清空筛选）
 * - 原子文本条件 / creatorIds / skills / jdIds
 * - 四档定性评价 recommendationLevels
 *
 * 多选字段以 CSV 字符串保存在 state（与 web data-grid 约定一致）。
 */

export interface ResumeLibraryFilters {
  createdAtRange: string;
  textFilters: string;
  creatorIds: string;
  jdIds: string;
  skills: string;
  /** 空字符串 = 全部阶段 */
  stage: string;
  recommendationLevels: string;
}

export const EMPTY_RESUME_LIBRARY_FILTERS: ResumeLibraryFilters = {
  createdAtRange: "",
  creatorIds: "",
  jdIds: "",
  recommendationLevels: "",
  skills: "",
  stage: "",
  textFilters: "",
};

export const RESUME_LIBRARY_FILTER_KEYS = [
  "textFilters",
  "createdAtRange",
  "creatorIds",
  "jdIds",
  "skills",
  "recommendationLevels",
] as const satisfies readonly (keyof ResumeLibraryFilters)[];

/** 与 web `PIPELINE_STAGE_TAB_DESCRIPTIONS` + `pipelineStageMeta` 对齐；隐藏笔试。 */
export const PIPELINE_STAGE_TABS = [
  { description: "全部候选人", label: "全部", value: "all" },
  { description: "简历筛选中", label: "简历筛选", value: "screening" },
  { description: "AI 面试阶段", label: "AI 面试", value: "ai_interview" },
  { description: "等候真人复面", label: "真人复面", value: "human_interview" },
  { description: "Offer 协商中", label: "Offer", value: "offer" },
  { description: "已结案候选人", label: "已结案", value: "closed" },
] as const;

export type PipelineStageTabValue = (typeof PIPELINE_STAGE_TABS)[number]["value"];

export function parseCsvValues(value: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toCsvValues(values: string[]): string {
  return values.join(",");
}

export function hasActiveResumeLibraryFilters(
  search: string,
  filters: ResumeLibraryFilters,
): boolean {
  if (search.trim() !== "") {
    return true;
  }
  return RESUME_LIBRARY_FILTER_KEYS.some(
    (key) => filters[key] !== EMPTY_RESUME_LIBRARY_FILTERS[key],
  );
}
