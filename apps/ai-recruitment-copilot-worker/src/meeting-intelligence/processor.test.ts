import { describe, expect, it, vi } from "vitest";

import { runMeetingIntelligenceProcessing } from "./processor";

const content = {
  actionItems: [],
  decisions: [{ evidenceTurnIds: ["turn-1"], statement: "采用方案 A" }],
  openQuestions: [],
  summary: "讨论了方案。",
  template: "general" as const,
  topics: [],
};

describe("Meeting Intelligence worker", () => {
  it("checkpoints provider output before atomically publishing the revision", async () => {
    const saveCheckpoint = vi.fn(() => Promise.resolve(true));
    const publish = vi.fn(() => Promise.resolve(true));
    const dependencies = {
      claim: vi.fn(() =>
        Promise.resolve({
          checkpoint: null,
          meetingId: "meeting-80",
          model: "provider/model",
          organizationId: "org-80",
          promptVersion: "meeting-intelligence-v1",
          provider: "provider",
          status: "claimed" as const,
          template: "general" as const,
          transcriptRevisionId: "transcript-80",
        }),
      ),
      createExecutionToken: () => "execution-80",
      generate: vi.fn(() => Promise.resolve(content)),
      generatorSnapshot: () => ({ model: "provider/model", provider: "provider" }),
      heartbeat: vi.fn(() => Promise.resolve(true)),
      loadTranscript: vi.fn(() =>
        Promise.resolve({
          turns: [
            {
              endMs: 2000,
              id: "turn-1",
              speakerDisplayName: null,
              speakerKey: "local",
              startMs: 1000,
              text: "采用方案 A",
            },
          ],
        }),
      ),
      markFailed: vi.fn(() => Promise.resolve(true)),
      publish,
      saveCheckpoint,
      saveProgress: vi.fn(() => Promise.resolve(true)),
    };

    await runMeetingIntelligenceProcessing(
      { processingRunId: "run-80" },
      { attempt: 1, maxAttempts: 5 },
      dependencies,
    );

    expect(saveCheckpoint).toHaveBeenCalledWith({
      content,
      executionToken: "execution-80",
      processingRunId: "run-80",
    });
    expect(saveCheckpoint.mock.invocationCallOrder[0]).toBeLessThan(
      publish.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("reuses a durable checkpoint without another provider call", async () => {
    const generate = vi.fn(() => Promise.resolve(content));
    const dependencies = {
      claim: vi.fn(() =>
        Promise.resolve({
          checkpoint: content,
          meetingId: "meeting-80",
          model: "provider/model",
          organizationId: "org-80",
          promptVersion: "meeting-intelligence-v1",
          provider: "provider",
          status: "claimed" as const,
          template: "general" as const,
          transcriptRevisionId: "transcript-80",
        }),
      ),
      createExecutionToken: () => "execution-80",
      generate,
      generatorSnapshot: () => ({ model: "new-provider/model", provider: "new-provider" }),
      heartbeat: vi.fn(() => Promise.resolve(true)),
      loadTranscript: vi.fn(),
      markFailed: vi.fn(() => Promise.resolve(true)),
      publish: vi.fn(() => Promise.resolve(true)),
      saveCheckpoint: vi.fn(() => Promise.resolve(true)),
      saveProgress: vi.fn(() => Promise.resolve(true)),
    };

    await runMeetingIntelligenceProcessing(
      { processingRunId: "run-80" },
      { attempt: 2, maxAttempts: 5 },
      dependencies,
    );

    expect(generate).not.toHaveBeenCalled();
    expect(dependencies.publish).toHaveBeenCalledOnce();
  });

  it("finishes a deterministic missing-input failure without consuming every retry", async () => {
    const markFailed = vi.fn(() => Promise.resolve(true));
    const dependencies = {
      claim: vi.fn(() =>
        Promise.resolve({
          checkpoint: null,
          meetingId: "meeting-80",
          model: "provider/model",
          organizationId: "org-80",
          promptVersion: "meeting-intelligence-v1",
          provider: "provider",
          status: "claimed" as const,
          template: "general" as const,
          transcriptRevisionId: "transcript-80",
        }),
      ),
      createExecutionToken: () => "execution-80",
      generate: vi.fn(),
      generatorSnapshot: () => ({ model: "provider/model", provider: "provider" }),
      heartbeat: vi.fn(() => Promise.resolve(true)),
      loadTranscript: vi.fn(() => Promise.resolve(null)),
      markFailed,
      publish: vi.fn(),
      saveCheckpoint: vi.fn(),
      saveProgress: vi.fn(() => Promise.resolve(true)),
    };

    await expect(
      runMeetingIntelligenceProcessing(
        { processingRunId: "run-80" },
        { attempt: 1, maxAttempts: 5 },
        dependencies,
      ),
    ).resolves.toBeUndefined();
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ terminal: true }));
  });

  it("keeps transient provider failures retryable", async () => {
    const providerError = new Error("provider temporarily unavailable");
    const markFailed = vi.fn(() => Promise.resolve(true));
    const dependencies = {
      claim: vi.fn(() =>
        Promise.resolve({
          checkpoint: null,
          meetingId: "meeting-80",
          model: "provider/model",
          organizationId: "org-80",
          promptVersion: "meeting-intelligence-v1",
          provider: "provider",
          status: "claimed" as const,
          template: "general" as const,
          transcriptRevisionId: "transcript-80",
        }),
      ),
      createExecutionToken: () => "execution-80",
      generate: vi.fn(() => Promise.reject(providerError)),
      generatorSnapshot: () => ({ model: "provider/model", provider: "provider" }),
      heartbeat: vi.fn(() => Promise.resolve(true)),
      loadTranscript: vi.fn(() => Promise.resolve({ turns: [] })),
      markFailed,
      publish: vi.fn(),
      saveCheckpoint: vi.fn(),
      saveProgress: vi.fn(() => Promise.resolve(true)),
    };

    await expect(
      runMeetingIntelligenceProcessing(
        { processingRunId: "run-80" },
        { attempt: 1, maxAttempts: 5 },
        dependencies,
      ),
    ).rejects.toThrow("provider temporarily unavailable");
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ terminal: false }));
  });

  it("marks a corrupt durable checkpoint terminal instead of recovering it forever", async () => {
    const markFailed = vi.fn(() => Promise.resolve(true));
    const dependencies = {
      claim: vi.fn(() =>
        Promise.resolve({
          checkpoint: null,
          checkpointInvalid: true,
          meetingId: "meeting-80",
          model: "provider/model",
          organizationId: "org-80",
          promptVersion: "meeting-intelligence-v1",
          provider: "provider",
          status: "claimed" as const,
          template: "general" as const,
          transcriptRevisionId: "transcript-80",
        }),
      ),
      createExecutionToken: () => "execution-80",
      generate: vi.fn(),
      generatorSnapshot: () => ({ model: "provider/model", provider: "provider" }),
      heartbeat: vi.fn(() => Promise.resolve(true)),
      loadTranscript: vi.fn(),
      markFailed,
      publish: vi.fn(),
      saveCheckpoint: vi.fn(),
      saveProgress: vi.fn(() => Promise.resolve(true)),
    };

    await expect(
      runMeetingIntelligenceProcessing(
        { processingRunId: "run-80" },
        { attempt: 1, maxAttempts: 5 },
        dependencies,
      ),
    ).resolves.toBeUndefined();
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ terminal: true }));
    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(dependencies.loadTranscript).not.toHaveBeenCalled();
  });
});
