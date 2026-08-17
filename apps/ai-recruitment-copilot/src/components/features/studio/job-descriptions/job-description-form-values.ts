import type { InterviewerListRecord } from "@arc/shared/interviewers";
import {
  createDefaultJobDescriptionStructuredConfig,
  createDefaultResumeScreeningPolicy,
} from "@arc/shared/job-descriptions";
import type { JobDescriptionFormValues, JobDescriptionRecord } from "@arc/shared/job-descriptions";
import { filterInterviewerIdsByDepartment } from "@arc/shared/job-description-interviewers";
import type { ReactFormExtendedApi } from "@tanstack/react-form";

export const NAME_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 500;
export const PROMPT_MAX_LENGTH = 10_000;
export const JOB_DESCRIPTION_MARKDOWN_CONTENT_HEIGHT = 320;
export const JOB_DESCRIPTION_MARKDOWN_MAX_HEIGHT = 480;
export const JOB_SETTING_FIELD_CLASS = "px-3.5 py-2.5 @md/field-group:gap-4";
export const JOB_SETTING_CONTROL_CLASS =
  "flex w-full flex-col gap-2 @md/field-group:basis-80 @md/field-group:shrink-0";

export type JobDescriptionFormTab = "basic" | "interview-questions" | "forms";
export type JobDescriptionSubmitAction = "preview" | "save";
export type JobDescriptionMutationPayload = Partial<JobDescriptionRecord> & { error?: string };

// oxlint-disable no-explicit-any -- TanStack Form has 11 validator generics after TFormData; only the values type matters here.
export type JobDescriptionFormApi = ReactFormExtendedApi<
  JobDescriptionFormValues,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;
// oxlint-enable no-explicit-any

export function recordEvaluationPreview(record: JobDescriptionRecord | null) {
  if (record?.evaluationBlueprintPreview && record.evaluationBlueprintPreviewHash) {
    return {
      blueprint: record.evaluationBlueprintPreview,
      blueprintHash: record.evaluationBlueprintPreviewHash,
    };
  }
  if (record?.evaluationBlueprint && record.evaluationBlueprintHash) {
    return {
      blueprint: record.evaluationBlueprint,
      blueprintHash: record.evaluationBlueprintHash,
    };
  }
  return null;
}

export function emptyJobDescriptionFormValues(): JobDescriptionFormValues {
  return {
    allowCrossDepartmentInterviewers: false,
    code: "",
    departmentId: "",
    description: "",
    interviewerIds: [],
    name: "",
    prompt: "",
    resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
  };
}

export function toFormValues(record: JobDescriptionRecord): JobDescriptionFormValues {
  const isStructured = record.evaluationMode === "structured";
  const description = record.description?.trim() ?? "";
  const prompt = record.prompt.trim();
  return {
    allowCrossDepartmentInterviewers: record.allowCrossDepartmentInterviewers,
    code: record.code ?? "",
    departmentId: record.departmentId,
    description: isStructured ? "" : (record.description ?? ""),
    interviewerIds: [...record.interviewerIds],
    name: record.name,
    prompt: isStructured ? prompt || description : record.prompt,
    resumeScreeningPolicy: record.resumeScreeningPolicy,
    structuredConfig: record.structuredConfig,
  };
}

export function toStructuredDraftValues(
  values: JobDescriptionFormValues,
): JobDescriptionFormValues {
  const description = values.description?.trim() ?? "";
  const prompt = values.prompt.trim();
  return {
    ...values,
    description: "",
    prompt: prompt || description,
  };
}

export function toDepartmentScopedFormValues(
  record: JobDescriptionRecord,
  interviewers: InterviewerListRecord[],
): JobDescriptionFormValues {
  const values = toFormValues(record);
  return {
    ...values,
    interviewerIds: filterInterviewerIdsByDepartment(
      interviewers,
      values.departmentId,
      values.interviewerIds,
      values.allowCrossDepartmentInterviewers,
    ),
  };
}

export function normalizeDepartmentId(value: string | null): string {
  return value ?? "";
}

export function hasUnsavedFormChanges(
  values: JobDescriptionFormValues,
  savedValues: JobDescriptionFormValues,
): boolean {
  return JSON.stringify(values) !== JSON.stringify(savedValues);
}

const JOB_DESCRIPTION_BASIC_FIELDS = [
  "code",
  "name",
  "departmentId",
  "allowCrossDepartmentInterviewers",
  "interviewerIds",
  "description",
  "prompt",
] as const;

export function focusJobDescriptionBasicTabOnInvalidSubmit(
  fieldMeta: Partial<Record<string, { errors?: unknown[] }>>,
  setActiveTab: (tab: JobDescriptionFormTab) => void,
) {
  const hasBasicError = JOB_DESCRIPTION_BASIC_FIELDS.some(
    (key) => (fieldMeta[key]?.errors?.length ?? 0) > 0,
  );
  const hasStructuredError = Object.entries(fieldMeta).some(
    ([key, meta]) =>
      (key === "structuredConfig" || key.startsWith("structuredConfig.")) &&
      (meta?.errors?.length ?? 0) > 0,
  );
  if (hasBasicError || hasStructuredError) {
    setActiveTab("basic");
  }
}
