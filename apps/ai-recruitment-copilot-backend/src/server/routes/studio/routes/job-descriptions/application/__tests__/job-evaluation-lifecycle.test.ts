import { describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { createJobEvaluationLifecycle } from "../job-evaluation-lifecycle";

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {},
}));

const preview = {
  auxiliarySkills: [],
  compiler: {
    generatedAt: "2026-07-29T10:00:00.000Z",
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
    description: "JD",
    evaluationMode: "structured" as const,
    id: "job-1",
    lifecycleStatus: "draft" as const,
    prompt: "Prompt",
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
  };
}

describe("job evaluation lifecycle", () => {
  it("persists a draft preview only when the captured input remains current", async () => {
    const savePreview = vi.fn().mockResolvedValue(true);
    const lifecycle = createJobEvaluationLifecycle({
      compile: vi.fn().mockResolvedValue(preview),
      load: vi.fn().mockResolvedValue(draft()),
      publishStoredPreview: vi.fn(),
      savePreview,
    });

    const result = await lifecycle.generatePreview({
      actorId: "actor",
      jobDescriptionId: "job-1",
      organizationId: "org-1",
    });

    expect(result.blueprint).toEqual(preview);
    expect(savePreview).toHaveBeenCalledOnce();
  });

  it("returns a stable stale-preview error when compilation loses a race", async () => {
    const lifecycle = createJobEvaluationLifecycle({
      compile: vi.fn().mockResolvedValue(preview),
      load: vi.fn().mockResolvedValue(draft()),
      publishStoredPreview: vi.fn(),
      savePreview: vi.fn().mockResolvedValue(false),
    });

    await expect(
      lifecycle.generatePreview({
        actorId: "actor",
        jobDescriptionId: "job-1",
        organizationId: "org-1",
      }),
    ).rejects.toMatchObject({ code: "JOB_BLUEPRINT_PREVIEW_STALE" });
  });

  it("maps repeated publication to JOB_ALREADY_PUBLISHED", async () => {
    const lifecycle = createJobEvaluationLifecycle({
      compile: vi.fn(),
      load: vi.fn(),
      publishStoredPreview: vi.fn().mockResolvedValue({ status: "already_published" }),
      savePreview: vi.fn(),
    });

    await expect(
      lifecycle.publish({
        actorId: "actor",
        confirmedBlueprintHash: "hash",
        jobDescriptionId: "job-1",
        organizationId: "org-1",
      }),
    ).rejects.toMatchObject({ code: "JOB_ALREADY_PUBLISHED" });
  });
});
