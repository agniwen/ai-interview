import { describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { createJobEvaluationLifecycle } from "../job-evaluation-lifecycle";

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
    evaluationBlueprintPreview: preview,
    evaluationBlueprintPreviewHash: "old-hash",
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
      saveManualPreview: vi.fn(),
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
      saveManualPreview: vi.fn(),
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
      saveManualPreview: vi.fn(),
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

  it("saves recruiter-edited scoring rules as manual sources", async () => {
    const saveManualPreview = vi.fn().mockResolvedValue(true);
    const lifecycle = createJobEvaluationLifecycle({
      compile: vi.fn(),
      load: vi.fn().mockResolvedValue(draft()),
      publishStoredPreview: vi.fn(),
      saveManualPreview,
      savePreview: vi.fn(),
    });

    const result = await lifecycle.saveRuleDraft({
      actorId: "actor",
      deductionRules: createDefaultJobDescriptionStructuredConfig().deductionRules,
      expectedBlueprintHash: "old-hash",
      jobDescriptionId: "job-1",
      organizationId: "org-1",
      ruleDraft: {
        auxiliarySkills: [],
        coreSkills: ["React"],
        dimensionExpectations: {
          educationBackground: [],
          experienceRelevance: [],
          potential: ["近两年持续学习"],
          projectMatch: [],
          skillMatch: ["具备 React 项目经验"],
          stability: ["职业经历连续"],
        },
        educationExpectation: null,
        requiredRelevantExperience: null,
        skillRequirementGroups: [
          { expectationType: "core", satisfactionMode: "all", skills: ["React"] },
        ],
      },
    });

    expect(result.blueprint.coreSkills[0]).toMatchObject({
      normalizedSkill: "React",
      sourceRef: { kind: "manual", path: "coreSkills.0" },
    });
    expect(saveManualPreview).toHaveBeenCalledOnce();
  });

  it("applies an edited primary experience requirement without dropping secondary requirements", async () => {
    const frontendRequirement = {
      relevanceScope: "role" as const,
      requirementId: "experience-frontend",
      scopeDescription: "前端开发",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "8 年以上前端开发经验",
      years: 8,
    };
    const managementRequirement = {
      relevanceScope: "capability" as const,
      requirementId: "experience-management",
      scopeDescription: "团队管理",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "3 年以上团队管理经验",
      years: 3,
    };
    const load = vi.fn().mockResolvedValue({
      ...draft(),
      evaluationBlueprintPreview: {
        ...preview,
        requiredRelevantExperience: frontendRequirement,
        requiredRelevantExperiences: [frontendRequirement, managementRequirement],
      },
    });
    const lifecycle = createJobEvaluationLifecycle({
      compile: vi.fn(),
      load,
      publishStoredPreview: vi.fn(),
      saveManualPreview: vi.fn().mockResolvedValue(true),
      savePreview: vi.fn(),
    });

    const result = await lifecycle.saveRuleDraft({
      actorId: "actor",
      deductionRules: createDefaultJobDescriptionStructuredConfig().deductionRules,
      expectedBlueprintHash: "old-hash",
      jobDescriptionId: "job-1",
      organizationId: "org-1",
      ruleDraft: {
        auxiliarySkills: [],
        coreSkills: [],
        dimensionExpectations: preview.dimensionExpectations,
        educationExpectation: null,
        requiredRelevantExperience: {
          relevanceScope: "role",
          scopeDescription: "前端开发",
          years: 6,
        },
        skillRequirementGroups: [],
      },
    });

    expect(result.blueprint.requiredRelevantExperiences?.map((item) => item.years)).toEqual([6, 3]);
  });
});
