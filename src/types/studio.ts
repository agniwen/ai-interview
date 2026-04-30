/**
 * Studio 管理后台领域类型聚合点。
 * Aggregation barrel for the Studio admin domain.
 *
 * 包含候选人表单、面试题模板、岗位描述等管理类型。
 * Includes candidate-form templates, interview-question templates, job descriptions, etc.
 */

export type {
  CandidateFormDisplayMode,
  CandidateFormOption,
  CandidateFormQuestionInput,
  CandidateFormQuestionType,
  CandidateFormScope,
  CandidateFormSubmissionRecord,
  CandidateFormSubmissionWithSnapshot,
  CandidateFormTemplateInput,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateQuestionRecord,
  CandidateFormTemplateRecord,
  CandidateFormTemplateSnapshot,
  CandidateFormTemplateSnapshotQuestion,
  CandidateFormTemplateVersionRecord,
} from "@/lib/candidate-forms";
