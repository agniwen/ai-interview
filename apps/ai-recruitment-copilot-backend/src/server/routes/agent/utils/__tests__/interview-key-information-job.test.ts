import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildInterviewReportQuestionsFromContext: vi.fn(),
  createInterviewEvidenceSnapshot: vi.fn(),
  generateInterviewKeyInformation: vi.fn(),
  safeUpdateTag: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: { update: mocks.update },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/cache-tags", () => ({
  cacheTags: {
    interviewConversations: "interview-conversations",
    interviewConversationsByRecord: (id: string) => `interview-conversations:${id}`,
  },
  safeUpdateTag: mocks.safeUpdateTag,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot", () => ({
  createInterviewEvidenceSnapshot: mocks.createInterviewEvidenceSnapshot,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-key-information",
  () => ({
    generateInterviewKeyInformation: mocks.generateInterviewKeyInformation,
  }),
);

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-report-questions",
  () => ({
    buildInterviewReportQuestionsFromContext: mocks.buildInterviewReportQuestionsFromContext,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { runKeyInformationJob } from "../interview-key-information-job";

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

function claimUpdate(rows: { keyInformationStartedAt?: Date; transcript: typeof TRANSCRIPT }[]) {
  return {
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue(rows),
      })),
    })),
  };
}

function persistedUpdate(
  onSet: (value: Record<string, unknown>) => void,
  rows: { conversationId: string }[] = [{ conversationId: "conversation-1" }],
) {
  return {
    set: vi.fn((value: Record<string, unknown>) => {
      onSet(value);
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(rows),
        })),
      };
    }),
  };
}

describe("runKeyInformationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildInterviewReportQuestionsFromContext.mockReturnValue([]);
    mocks.createInterviewEvidenceSnapshot.mockResolvedValue({
      payload: {
        context: {
          candidate: { targetRole: "前端工程师" },
          jobDescription: null,
        },
      },
    });
    mocks.generateInterviewKeyInformation.mockResolvedValue(KEY_INFORMATION);
  });

  it("persists an independently generated result and marks it ready", async () => {
    let persisted: Record<string, unknown> | null = null;
    mocks.update
      .mockReturnValueOnce(
        claimUpdate([
          {
            keyInformationStartedAt: new Date("2026-07-24T10:00:00.000Z"),
            transcript: TRANSCRIPT,
          },
        ]),
      )
      .mockReturnValueOnce(
        persistedUpdate((value) => {
          persisted = value;
        }),
      );

    await runKeyInformationJob({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });

    expect(mocks.generateInterviewKeyInformation).toHaveBeenCalledWith(
      expect.objectContaining({
        targetRole: "前端工程师",
        transcript: TRANSCRIPT,
      }),
    );
    expect(persisted).toMatchObject({
      keyInformation: KEY_INFORMATION,
      keyInformationAttempts: 0,
      keyInformationError: null,
      keyInformationStatus: "ready",
    });
    expect(mocks.safeUpdateTag).toHaveBeenCalledTimes(2);
  });

  it("does nothing when another worker already claimed the job", async () => {
    mocks.update.mockReturnValueOnce(claimUpdate([]));

    await runKeyInformationJob({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });

    expect(mocks.generateInterviewKeyInformation).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("marks only the key-information task failed when generation throws", async () => {
    let failureState: Record<string, unknown> | null = null;
    mocks.generateInterviewKeyInformation.mockRejectedValue(new Error("model unavailable"));
    mocks.update
      .mockReturnValueOnce(
        claimUpdate([
          {
            keyInformationStartedAt: new Date("2026-07-24T10:00:00.000Z"),
            transcript: TRANSCRIPT,
          },
        ]),
      )
      .mockReturnValueOnce(
        persistedUpdate((value) => {
          failureState = value;
        }),
      );

    await runKeyInformationJob({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });

    expect(failureState).toMatchObject({
      keyInformationError: "model unavailable",
      keyInformationStatus: "failed",
    });
    expect(mocks.safeUpdateTag).not.toHaveBeenCalled();
  });

  it("does not publish a stale result after a newer transcript resets the run", async () => {
    let staleWrite: Record<string, unknown> | null = null;
    mocks.update
      .mockReturnValueOnce(
        claimUpdate([
          {
            keyInformationStartedAt: new Date("2026-07-24T10:00:00.000Z"),
            transcript: TRANSCRIPT,
          },
        ]),
      )
      .mockReturnValueOnce(
        persistedUpdate((value) => {
          staleWrite = value;
        }, []),
      );

    await runKeyInformationJob({
      conversationId: "conversation-1",
      interviewRecordId: "interview-1",
    });

    expect(staleWrite).toMatchObject({ keyInformation: KEY_INFORMATION });
    expect(mocks.safeUpdateTag).not.toHaveBeenCalled();
  });
});
