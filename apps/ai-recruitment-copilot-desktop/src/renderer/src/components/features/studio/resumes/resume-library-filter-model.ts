/**
 * Desktop 招聘台筛选模型 — 与 web 端 `resume-library-page-model` / filters-config 对齐：
 * - stage 条件（隐藏 written_test）
 * - 原子文本条件 / creatorIds / skills / jdIds
 * - 单选 structured 岗位时的 structuredMinScore / structuredMaxScore
 *
 * 多选字段以 CSV 字符串保存在 state（与 web data-grid 约定一致）。
 */

export interface ResumeLibraryFilters {
  textFilters: string;
  creatorIds: string;
  jdIds: string;
  skills: string;
  /** 空字符串 = 全部阶段 */
  stage: string;
  structuredMaxScore: string;
  structuredMinScore: string;
}

export const EMPTY_RESUME_LIBRARY_FILTERS: ResumeLibraryFilters = {
  creatorIds: "",
  jdIds: "",
  skills: "",
  stage: "",
  structuredMaxScore: "",
  structuredMinScore: "",
  textFilters: "",
};

export const RESUME_LIBRARY_FILTER_KEYS = [
  "textFilters",
  "creatorIds",
  "jdIds",
  "skills",
  "stage",
  "structuredMaxScore",
  "structuredMinScore",
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

export const STRUCTURED_SCORE_OPTIONS = [60, 75, 85, 90] as const;

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
