import type {
  CandidateFormQuestionInput,
  CandidateFormQuestionType,
  CandidateFormTemplateInput,
  CandidateFormTemplateRecord,
} from "@app/db-schema/candidate-forms";
import { DEFAULT_DISPLAY_MODE } from "@app/db-schema/candidate-forms";

export function makeDefaultQuestion(
  sortOrder: number,
  type: CandidateFormQuestionType = "single",
): CandidateFormQuestionInput {
  return {
    displayMode: DEFAULT_DISPLAY_MODE[type],
    helperText: "",
    id: crypto.randomUUID(),
    label: "",
    options:
      type === "text"
        ? []
        : [
            { label: "选项 1", value: "option_1" },
            { label: "选项 2", value: "option_2" },
          ],
    required: true,
    sortOrder,
    type,
  };
}

export function emptyFormTemplateValues(): CandidateFormTemplateInput {
  return {
    description: "",
    jobDescriptionIds: [],
    questions: [makeDefaultQuestion(0)],
    scope: "global",
    title: "",
  };
}

export function toFormValues(record: CandidateFormTemplateRecord): CandidateFormTemplateInput {
  return {
    description: record.description ?? "",
    jobDescriptionIds: record.jobDescriptionIds,
    questions: record.questions.map((question, index) => ({
      displayMode: question.displayMode,
      helperText: question.helperText ?? "",
      id: question.id,
      label: question.label,
      options: question.options.map((option) => ({ ...option })),
      required: question.required,
      sortOrder: index,
      type: question.type,
    })),
    scope: record.scope,
    title: record.title,
  };
}
