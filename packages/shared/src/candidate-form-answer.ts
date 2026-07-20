import type { CandidateFormTemplateSnapshotQuestion } from "@arc/db-schema/candidate-forms";

export function formatCandidateFormAnswer(
  question: Pick<CandidateFormTemplateSnapshotQuestion, "options" | "type">,
  rawValue: string | string[] | undefined,
): string {
  if (
    rawValue === undefined ||
    rawValue === "" ||
    (Array.isArray(rawValue) && rawValue.length === 0)
  ) {
    return "";
  }

  if (question.type === "single" || question.type === "multi") {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    return values
      .map((value) => question.options.find((option) => option.value === value)?.label ?? value)
      .join("、");
  }

  return Array.isArray(rawValue) ? rawValue.join("、") : rawValue;
}
