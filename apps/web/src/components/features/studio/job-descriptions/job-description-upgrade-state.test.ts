import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  canPublishJobDescriptionUpgrade,
  getJobDescriptionUpgradeActionLabel,
  hasUnsavedJobDescriptionUpgradeChanges,
  saveDraftBeforeGeneratingUpgradePreview,
} from "./job-description-upgrade-state";

const structuredConfig = createDefaultJobDescriptionStructuredConfig();

describe("job description upgrade state", () => {
  it("distinguishes a new upgrade from an existing upgrade draft", () => {
    expect(
      getJobDescriptionUpgradeActionLabel({
        evaluationMode: "legacy",
        hasEvaluationUpgradeDraft: false,
      }),
    ).toBe("升级评分规则");
    expect(
      getJobDescriptionUpgradeActionLabel({
        evaluationMode: "legacy",
        hasEvaluationUpgradeDraft: true,
      }),
    ).toBe("继续升级");
    expect(
      getJobDescriptionUpgradeActionLabel({
        evaluationMode: "structured",
        hasEvaluationUpgradeDraft: false,
      }),
    ).toBeNull();
  });

  it("treats prompt or structured config changes as unsaved", () => {
    expect(
      hasUnsavedJobDescriptionUpgradeChanges({
        draftPrompt: "旧提示词",
        draftStructuredConfig: structuredConfig,
        prompt: "新提示词",
        structuredConfig,
      }),
    ).toBe(true);
    expect(
      hasUnsavedJobDescriptionUpgradeChanges({
        draftPrompt: "提示词",
        draftStructuredConfig: structuredConfig,
        prompt: "提示词",
        structuredConfig,
      }),
    ).toBe(false);
  });

  it("allows publish only for a clean draft with a current preview", () => {
    expect(
      canPublishJobDescriptionUpgrade({
        blueprintPreviewHash: "blueprint-hash",
        blueprintPreviewInputHash: "input-hash",
        hasUnsavedChanges: false,
      }),
    ).toBe(true);
    expect(
      canPublishJobDescriptionUpgrade({
        blueprintPreviewHash: "blueprint-hash",
        blueprintPreviewInputHash: null,
        hasUnsavedChanges: false,
      }),
    ).toBe(false);
    expect(
      canPublishJobDescriptionUpgrade({
        blueprintPreviewHash: "blueprint-hash",
        blueprintPreviewInputHash: "input-hash",
        hasUnsavedChanges: true,
      }),
    ).toBe(false);
  });

  it("accepts an auto-saved draft before a failing preview request", async () => {
    const events: string[] = [];

    await expect(
      saveDraftBeforeGeneratingUpgradePreview({
        acceptDraft: (draft) => events.push(`accept:${draft.version}`),
        currentDraft: { version: 1 },
        generatePreview: (draft) => {
          events.push(`preview:${draft.version}`);
          return Promise.reject(new Error("preview unavailable"));
        },
        hasUnsavedChanges: true,
        saveDraft: (draft) => {
          events.push(`save:${draft.version}`);
          return Promise.resolve({ version: 2 });
        },
      }),
    ).rejects.toThrow("preview unavailable");
    expect(events).toEqual(["save:1", "accept:2", "preview:2"]);
  });
});
