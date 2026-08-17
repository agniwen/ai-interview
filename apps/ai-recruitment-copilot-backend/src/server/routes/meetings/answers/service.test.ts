import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  askMeetingQuestion,
  createSavedMeetingQuestionThread,
  getSavedMeetingQuestionThread,
} from "./service";
import type { MeetingAnswerDependencies } from "./service";

const mocks = {
  createMeetingAnswerExchange: vi.fn(),
  createMeetingQuestionThread: vi.fn(),
  enqueueMeetingAnswerJobs: vi.fn(),
  getMeetingAnswerGeneratorSnapshot: vi.fn(),
  isMeetingAnswerQueueConfigured: vi.fn(),
  listMeetingQuestionThreads: vi.fn(),
  loadMeetingAccess: vi.fn(),
  loadMeetingQuestionThread: vi.fn(),
  recordMeetingAudit: vi.fn(),
} satisfies MeetingAnswerDependencies;

const access = {
  meetingId: "meeting-81",
  memberRole: "member",
  organizationId: "org-81",
  userId: "user-81",
};

describe("Meeting Answer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadMeetingAccess.mockResolvedValue({ role: "viewer" });
    mocks.isMeetingAnswerQueueConfigured.mockReturnValue(true);
    mocks.getMeetingAnswerGeneratorSnapshot.mockReturnValue({
      model: "gpt-5-mini",
      provider: "mastra",
    });
  });

  it("allows a Viewer to create only their own thread", async () => {
    mocks.createMeetingQuestionThread.mockResolvedValue({ id: "thread-81", title: "新提问" });
    await expect(
      createSavedMeetingQuestionThread({ ...access, title: undefined }, mocks),
    ).resolves.toEqual({ id: "thread-81", title: "新提问" });
    expect(mocks.createMeetingQuestionThread).toHaveBeenCalledWith({
      createdBy: "user-81",
      meetingId: "meeting-81",
      organizationId: "org-81",
      title: "新提问",
    });
  });

  it("hides a thread after meeting access is revoked", async () => {
    mocks.loadMeetingAccess.mockResolvedValue(null);
    await expect(
      getSavedMeetingQuestionThread({ ...access, threadId: "thread-81" }, mocks),
    ).resolves.toBeNull();
    expect(mocks.loadMeetingQuestionThread).not.toHaveBeenCalled();
  });

  it("persists one placeholder then enqueues its stable exchange id", async () => {
    mocks.createMeetingAnswerExchange.mockResolvedValue({ id: "exchange-81", status: "pending" });
    await expect(
      askMeetingQuestion(
        {
          ...access,
          question: "谁负责支付迁移？",
          requestId: "00000000-0000-4000-8000-000000000081",
          threadId: "thread-81",
        },
        mocks,
      ),
    ).resolves.toMatchObject({ id: "exchange-81", status: "pending" });
    expect(mocks.enqueueMeetingAnswerJobs).toHaveBeenCalledWith([{ exchangeId: "exchange-81" }]);
  });

  it("does not persist a question when no answer worker is configured", async () => {
    mocks.isMeetingAnswerQueueConfigured.mockReturnValue(false);
    await expect(
      askMeetingQuestion(
        {
          ...access,
          question: "谁负责支付迁移？",
          requestId: "00000000-0000-4000-8000-000000000081",
          threadId: "thread-81",
        },
        mocks,
      ),
    ).resolves.toBe("unavailable");
    expect(mocks.createMeetingAnswerExchange).not.toHaveBeenCalled();
  });
});
