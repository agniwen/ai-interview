import type { JobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";

export function getJobDescriptionUpgradeActionLabel(record: {
  evaluationMode: "legacy" | "qualitative" | "structured";
  hasEvaluationUpgradeDraft: boolean;
}): "升级评分规则" | "继续升级" | null {
  if (record.evaluationMode !== "legacy") {
    return null;
  }
  return record.hasEvaluationUpgradeDraft ? "继续升级" : "升级评分规则";
}

export function hasUnsavedJobDescriptionUpgradeChanges(input: {
  draftPrompt: string;
  draftStructuredConfig: JobDescriptionStructuredConfig;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
}): boolean {
  return (
    input.prompt.trim() !== input.draftPrompt ||
    JSON.stringify(input.structuredConfig) !== JSON.stringify(input.draftStructuredConfig)
  );
}

export function canPublishJobDescriptionUpgrade(input: {
  blueprintPreviewHash: string | null;
  blueprintPreviewInputHash: string | null;
  hasUnsavedChanges: boolean;
}): boolean {
  return Boolean(
    input.blueprintPreviewHash && input.blueprintPreviewInputHash && !input.hasUnsavedChanges,
  );
}

export async function saveDraftBeforeGeneratingUpgradePreview<TDraft, TPreview>(input: {
  acceptDraft: (draft: TDraft) => void;
  currentDraft: TDraft;
  generatePreview: (draft: TDraft) => Promise<TPreview>;
  hasUnsavedChanges: boolean;
  saveDraft: (draft: TDraft) => Promise<TDraft>;
}): Promise<TPreview> {
  let savedDraft = input.currentDraft;
  if (input.hasUnsavedChanges) {
    savedDraft = await input.saveDraft(input.currentDraft);
    input.acceptDraft(savedDraft);
  }
  return input.generatePreview(savedDraft);
}
