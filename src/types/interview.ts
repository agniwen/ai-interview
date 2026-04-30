/**
 * 面试领域类型聚合点。
 * Aggregation barrel for interview-domain types.
 *
 * 真实定义仍在 `@/lib/interview/*` 中，这里只做统一导出，方便业务代码以
 * `@/types` 为入口取用，避免直接依赖底层文件路径。
 *
 * Source of truth still lives under `@/lib/interview/*`; this file only re-exports
 * so callers can import via `@/types` and stay decoupled from internal paths.
 */

export type {
  GeneratedInterviewQuestion,
  InterviewQuestion,
  ResumeAnalysisResult,
  ResumeProfile,
} from "@/lib/interview/types";

export type {
  CandidateInterviewView,
  InterviewScheduleEntry,
} from "@/lib/interview/interview-record";

export type {
  ScheduleEntryStatus,
  StudioInterviewFormValues,
  StudioInterviewListRecord,
  StudioInterviewRecord,
  StudioInterviewScheduleEntryFormValue,
  StudioInterviewStatus,
  StudioInterviewUpdateValues,
} from "@/lib/studio-interviews";
