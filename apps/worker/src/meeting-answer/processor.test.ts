import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingAnswerTerminalError } from "@app/shared/meeting-answer";
import { runMeetingAnswerProcessing } from "./processor";

const context = {
  intelligence: null,
  notes: [],
  previous: [],
  turns: [
    {
      endMs: 5000,
      id: "turn-81",
      speakerDisplayName: null,
      speakerKey: "local",
      startMs: 1000,
      text: "候选人负责支付迁移。",
    },
  ],
};

function dependencies() {
  return {
    claim: vi.fn().mockResolvedValue({
      exchangeId: "exchange-81",
      inputIntelligenceRevisionId: null,
      inputTranscriptRevisionId: "transcript-81",
      meetingId: "meeting-81",
      model: "gpt-5-mini",
      organizationId: "org-81",
      promptVersion: "meeting-answer-v1",
      provider: "mastra",
      question: "谁负责支付迁移？",
      sequence: 1,
      status: "claimed",
      threadId: "thread-81",
    }),
    createExecutionToken: vi.fn().mockReturnValue("token-81"),
    generate: vi.fn().mockResolvedValue({
      citations: [{ endMs: 5000, startMs: 1000, turnId: "turn-81" }],
      kind: "answer",
      text: "候选人负责支付迁移。",
    }),
    generatorSnapshot: vi.fn().mockReturnValue({ model: "gpt-5-mini", provider: "mastra" }),
    loadContext: vi.fn().mockResolvedValue(context),
    markFailed: vi.fn().mockResolvedValue(true),
    publish: vi.fn().mockResolvedValue(true),
  };
}

describe("Meeting Answer worker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fills the reserved assistant exchange exactly once", async () => {
    const deps = dependencies();
    await runMeetingAnswerProcessing(
      { exchangeId: "exchange-81" },
      { attempt: 1, maxAttempts: 5 },
      deps,
    );
    expect(deps.generate).toHaveBeenCalledWith({
      ...context,
      question: "谁负责支付迁移？",
    });
    expect(deps.publish).toHaveBeenCalledWith({
      answer: expect.objectContaining({ kind: "answer" }),
      exchangeId: "exchange-81",
      executionToken: "token-81",
    });
    expect(deps.markFailed).not.toHaveBeenCalled();
  });

  it("does not call the provider for an already completed delivery", async () => {
    const deps = dependencies();
    deps.claim.mockResolvedValue({ status: "already-ready" });
    await runMeetingAnswerProcessing(
      { exchangeId: "exchange-81" },
      { attempt: 2, maxAttempts: 5 },
      deps,
    );
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("persists invalid evidence as a terminal public failure", async () => {
    const deps = dependencies();
    deps.generate.mockRejectedValue(
      new MeetingAnswerTerminalError("citation included another meeting"),
    );
    await runMeetingAnswerProcessing(
      { exchangeId: "exchange-81" },
      { attempt: 1, maxAttempts: 5 },
      deps,
    );
    expect(deps.markFailed).toHaveBeenCalledWith({
      exchangeId: "exchange-81",
      executionToken: "token-81",
      terminal: true,
    });
  });

  it("rethrows transient provider failures while preserving the placeholder", async () => {
    const deps = dependencies();
    const error = new Error("provider temporarily unavailable");
    deps.generate.mockRejectedValue(error);
    await expect(
      runMeetingAnswerProcessing(
        { exchangeId: "exchange-81" },
        { attempt: 1, maxAttempts: 5 },
        deps,
      ),
    ).rejects.toBe(error);
    expect(deps.markFailed).toHaveBeenCalledWith({
      exchangeId: "exchange-81",
      executionToken: "token-81",
      terminal: false,
    });
  });
});
