import { describe, expect, it, vi } from "vitest";
import { toJobEvaluationRuleDraft } from "@arc/db-schema/job-description-evaluation";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { JobEvaluationUpgradeError } from "../job-evaluation-upgrade";
import { createJobEvaluationUpgradeApplication } from "../job-evaluation-upgrade";

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));

const CONFIG = createDefaultJobDescriptionStructuredConfig();

const BLUEPRINT = {
  auxiliarySkills: [],
  compiler: {
    generatedAt: "2026-08-04T08:00:00.000Z",
    modelId: "test",
    promptVersion: "v1",
  },
  coreSkills: [],
  dimensionExpectations: {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  },
  educationExpectation: null,
  exclusionConditions: [],
  hardGateRequirements: [],
  priorityConditions: [],
  requiredRelevantExperience: null,
  schemaVersion: 1 as const,
};

function draft() {
  return {
    blueprintPreview: null,
    blueprintPreviewGeneratedAt: null,
    blueprintPreviewHash: null,
    blueprintPreviewInputHash: null,
    createdAt: new Date("2026-08-04T07:00:00.000Z"),
    createdBy: "user-1",
    id: "upgrade-1",
    jobDescriptionId: "job-1",
    organizationId: "org-1",
    prompt: "负责 TypeScript 平台开发",
    structuredConfig: CONFIG,
    updatedAt: new Date("2026-08-04T07:00:00.000Z"),
    updatedBy: "user-1",
    version: 1,
  };
}

function dependencies() {
  return {
    compile: vi.fn().mockResolvedValue(BLUEPRINT),
    createDraft: vi.fn().mockResolvedValue({ draft: draft(), status: "created" as const }),
    discardDraft: vi.fn().mockResolvedValue("discarded" as const),
    getDraft: vi.fn().mockResolvedValue(draft()),
    publishDraft: vi.fn().mockResolvedValue({
      invalidatedLegacyAttemptCount: 0,
      jobId: "job-1",
      status: "published" as const,
    }),
    saveManualPreview: vi.fn().mockResolvedValue({ ...draft(), version: 2 }),
    savePreview: vi.fn().mockResolvedValue({
      ...draft(),
      blueprintPreview: BLUEPRINT,
      blueprintPreviewGeneratedAt: new Date(BLUEPRINT.compiler.generatedAt),
      blueprintPreviewHash: "blueprint-hash",
      blueprintPreviewInputHash: "input-hash",
      version: 2,
    }),
    updateDraft: vi.fn().mockResolvedValue({ ...draft(), prompt: "更新后的 Prompt", version: 2 }),
  };
}

const KEY = {
  actorId: "user-1",
  jobDescriptionId: "job-1",
  organizationId: "org-1",
};

describe("job evaluation upgrade application", () => {
  it("creates a separate upgrade draft from the legacy prompt", async () => {
    const deps = dependencies();
    const app = createJobEvaluationUpgradeApplication(deps);

    const result = await app.createDraft(KEY);

    expect(result.prompt).toBe("负责 TypeScript 平台开发");
    expect(deps.createDraft).toHaveBeenCalledWith(KEY);
  });

  it("generates and saves a preview against the expected draft version", async () => {
    const deps = dependencies();
    const app = createJobEvaluationUpgradeApplication(deps);

    const result = await app.generatePreview({ ...KEY, expectedVersion: 1 });

    expect(deps.compile).toHaveBeenCalledWith(
      expect.objectContaining({ description: null, prompt: draft().prompt }),
    );
    expect(deps.savePreview).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1 }));
    expect(result.version).toBe(2);
  });

  it("maps a stale publish to a stable domain error", async () => {
    const deps = dependencies();
    deps.publishDraft.mockResolvedValueOnce({ status: "stale" });
    const app = createJobEvaluationUpgradeApplication(deps);

    await expect(
      app.publish({
        ...KEY,
        confirmedBlueprintHash: "blueprint-hash",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "UPGRADE_PREVIEW_STALE",
    } satisfies Partial<JobEvaluationUpgradeError>);
  });

  it.each([
    ["already_upgraded", "JOB_ALREADY_UPGRADED"],
    ["not_found", "JOB_NOT_FOUND"],
    ["not_legacy", "JOB_NOT_LEGACY"],
    ["not_published", "JOB_NOT_PUBLISHED"],
    ["version_conflict", "UPGRADE_DRAFT_VERSION_CONFLICT"],
  ] as const)("maps create failure %s to %s", async (status, code) => {
    const deps = dependencies();
    deps.createDraft.mockResolvedValueOnce({ status } as never);
    const app = createJobEvaluationUpgradeApplication(deps);

    await expect(app.createDraft(KEY)).rejects.toMatchObject({ code });
  });

  it("rejects preview generation from a stale draft version before invoking AI", async () => {
    const deps = dependencies();
    const app = createJobEvaluationUpgradeApplication(deps);

    await expect(app.generatePreview({ ...KEY, expectedVersion: 2 })).rejects.toMatchObject({
      code: "UPGRADE_DRAFT_VERSION_CONFLICT",
    });
    expect(deps.compile).not.toHaveBeenCalled();
  });

  it("rejects manual rules when the preview no longer matches the draft", async () => {
    const deps = dependencies();
    const app = createJobEvaluationUpgradeApplication(deps);

    await expect(
      app.saveRuleDraft({
        ...KEY,
        deductionRules: CONFIG.deductionRules,
        expectedBlueprintHash: "old-blueprint-hash",
        expectedVersion: 1,
        ruleDraft: toJobEvaluationRuleDraft(BLUEPRINT),
      }),
    ).rejects.toMatchObject({ code: "UPGRADE_PREVIEW_STALE" });
    expect(deps.saveManualPreview).not.toHaveBeenCalled();
  });
});
