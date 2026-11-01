import { describe, expect, it, vi } from "vitest";
import { scheduleCandidateQuestionGenerationForRecord } from "../candidate-question-generation";
import type { CandidateQuestionSchedulingDependencies } from "../candidate-question-generation";

const input = { organizationId: "org-1", resumeRecordId: "record-1" };

function createDependencies(
  overrides: Partial<CandidateQuestionSchedulingDependencies> = {},
): CandidateQuestionSchedulingDependencies {
  return {
    enqueue: vi.fn<CandidateQuestionSchedulingDependencies["enqueue"]>().mockResolvedValue(),
    generate: vi
      .fn<CandidateQuestionSchedulingDependencies["generate"]>()
      .mockResolvedValue("generated"),
    isQueueConfigured: vi.fn(() => true),
    ...overrides,
  };
}

describe("scheduleCandidateQuestionGenerationForRecord", () => {
  it("leaves generation to the queue when the job is enqueued", async () => {
    const dependencies = createDependencies();

    await scheduleCandidateQuestionGenerationForRecord(input, dependencies);

    expect(dependencies.enqueue).toHaveBeenCalledWith([
      { ...input, source: "resume_pool_import_questions" },
    ]);
    expect(dependencies.generate).not.toHaveBeenCalled();
  });

  it("generates in-process when the queue is not configured", async () => {
    const dependencies = createDependencies({ isQueueConfigured: vi.fn(() => false) });

    await scheduleCandidateQuestionGenerationForRecord(input, dependencies);

    expect(dependencies.enqueue).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(dependencies.generate).toHaveBeenCalledWith(input));
  });

  it("generates in-process when enqueueing fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dependencies = createDependencies({
      enqueue: vi
        .fn<CandidateQuestionSchedulingDependencies["enqueue"]>()
        .mockRejectedValue(new Error("redis unavailable")),
    });

    await scheduleCandidateQuestionGenerationForRecord(input, dependencies);

    await vi.waitFor(() => expect(dependencies.generate).toHaveBeenCalledWith(input));
  });

  it("does not reject the caller when in-process generation fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const dependencies = createDependencies({
      generate: vi
        .fn<CandidateQuestionSchedulingDependencies["generate"]>()
        .mockRejectedValue(new Error("model unavailable")),
      isQueueConfigured: vi.fn(() => false),
    });

    await expect(
      scheduleCandidateQuestionGenerationForRecord(input, dependencies),
    ).resolves.toBeUndefined();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});
