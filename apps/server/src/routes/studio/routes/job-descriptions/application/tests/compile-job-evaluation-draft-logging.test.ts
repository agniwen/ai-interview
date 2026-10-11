import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";
import { compileJobEvaluationDraft } from "../job-evaluation-lifecycle";

const mocks = {
  generateEvaluationBlueprintCandidate: vi.fn(),
};

describe("compileJobEvaluationDraft generation errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs diagnostic context and preserves the original generation error", async () => {
    const generationError = new Error("sourceText 必须逐字引用 JD 的连续原文");
    mocks.generateEvaluationBlueprintCandidate.mockRejectedValueOnce(generationError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      compileJobEvaluationDraft(
        {
          description: "岗位描述",
          id: "job-1",
          prompt: "完整岗位要求",
          structuredConfig: createDefaultJobDescriptionStructuredConfig(),
        },
        undefined,
        {
          generate: mocks.generateEvaluationBlueprintCandidate,
          getModelId: () => "test-structured-model",
        },
      ),
    ).rejects.toMatchObject({
      cause: generationError,
      code: "JOB_BLUEPRINT_GENERATION_FAILED",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[job-evaluation-blueprint] generation failed",
      expect.objectContaining({
        durationMs: expect.any(Number),
        error: generationError,
        jobDescriptionId: "job-1",
        modelId: "test-structured-model",
        promptVersion: expect.any(String),
      }),
    );
  });
});
