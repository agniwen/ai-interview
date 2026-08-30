import { beforeEach, describe, expect, it, vi } from "vitest";
import { runKeyInformationJob } from "../interview-key-information-job-core";
import type { KeyInformationJobDependencies } from "../interview-key-information-job-core";

const mocks = {
  buildQuestions: vi.fn(),
  claim: vi.fn(),
  createEvidence: vi.fn(),
  generate: vi.fn(),
  markFailed: vi.fn(),
  persist: vi.fn(),
  publish: vi.fn(),
};

const jobDependencies = {
  ...mocks,
} satisfies KeyInformationJobDependencies;

const TRANSCRIPT = [
  { message: "请介绍项目。", role: "agent" as const, timeInCallSecs: 1 },
  { message: "我负责 React 组件架构。", role: "user" as const, timeInCallSecs: 5 },
];

const KEY_INFORMATION = {
  quantitativeInformation: [],
  risks: [],
  skillEvidence: [
    {
      content: "候选人负责 React 组件架构。",
      evidence: [{ quote: "我负责 React 组件架构。", timeInCallSecs: 5, turnIndex: 2 }],
    },
  ],
};

type PersistInput = Parameters<KeyInformationJobDependencies["persist"]>[0];

describe("runKeyInformationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildQuestions.mockReturnValue([]);
    mocks.createEvidence.mockResolvedValue({
      payload: {
        context: {
          candidate: { targetRole: "前端工程师" },
          jobDescription: null,
        },
      },
    });
    mocks.generate.mockResolvedValue(KEY_INFORMATION);
    mocks.markFailed.mockImplementation(() => Promise.resolve());
    mocks.persist.mockResolvedValue([{ conversationId: "conversation-1" }]);
  });

  it("persists an independently generated result and marks it ready", async () => {
    let persisted: PersistInput | null = null;
    const startedAt = new Date("2026-07-24T10:00:00.000Z");
    mocks.claim.mockResolvedValueOnce([
      { keyInformationStartedAt: startedAt, transcript: TRANSCRIPT },
    ]);
    mocks.persist.mockImplementationOnce((value: PersistInput) => {
      persisted = value;
      return Promise.resolve([{ conversationId: "conversation-1" }]);
    });

    await runKeyInformationJob(
      { conversationId: "conversation-1", interviewRecordId: "interview-1" },
      jobDependencies,
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRole: "前端工程师",
        transcript: TRANSCRIPT,
      }),
    );
    expect(persisted).toMatchObject({
      conversationId: "conversation-1",
      keyInformation: KEY_INFORMATION,
      startedAt,
    });
    expect(mocks.publish).toHaveBeenCalledWith("interview-1");
  });

  it("does nothing when another worker already claimed the job", async () => {
    mocks.claim.mockResolvedValueOnce([]);

    await runKeyInformationJob(
      { conversationId: "conversation-1", interviewRecordId: "interview-1" },
      jobDependencies,
    );

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.claim).toHaveBeenCalledTimes(1);
  });

  it("marks only the key-information task failed when generation throws", async () => {
    let failureState: { message: string } | null = null;
    const startedAt = new Date("2026-07-24T10:00:00.000Z");
    mocks.claim.mockResolvedValueOnce([
      { keyInformationStartedAt: startedAt, transcript: TRANSCRIPT },
    ]);
    mocks.generate.mockRejectedValue(new Error("model unavailable"));
    mocks.markFailed.mockImplementationOnce((value: { message: string }) => {
      failureState = value;
      return Promise.resolve();
    });

    await runKeyInformationJob(
      { conversationId: "conversation-1", interviewRecordId: "interview-1" },
      jobDependencies,
    );

    expect(failureState).toEqual(expect.objectContaining({ message: "model unavailable" }));
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("does not publish a stale result after a newer transcript resets the run", async () => {
    let staleWrite: PersistInput | null = null;
    const startedAt = new Date("2026-07-24T10:00:00.000Z");
    mocks.claim.mockResolvedValueOnce([
      { keyInformationStartedAt: startedAt, transcript: TRANSCRIPT },
    ]);
    mocks.persist.mockImplementationOnce((value: PersistInput) => {
      staleWrite = value;
      return Promise.resolve([]);
    });

    await runKeyInformationJob(
      { conversationId: "conversation-1", interviewRecordId: "interview-1" },
      jobDependencies,
    );

    expect(staleWrite).toMatchObject({ keyInformation: KEY_INFORMATION });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
