import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createExchange: vi.fn(),
  createThread: vi.fn(),
  enqueue: vi.fn(),
  generatorSnapshot: vi.fn(),
  isQueueConfigured: vi.fn(),
  listThreads: vi.fn(),
  loadAuthorizedMeeting: vi.fn(),
  loadThread: vi.fn(),
  meetingRole: vi.fn(),
  recordMeetingAudit: vi.fn(),
}));

vi.mock("./dao", () => ({
  createMeetingAnswerExchange: mocks.createExchange,
  createMeetingQuestionThread: mocks.createThread,
  listMeetingQuestionThreads: mocks.listThreads,
  loadMeetingQuestionThread: mocks.loadThread,
}));
vi.mock("./generator", () => ({ getMeetingAnswerGeneratorSnapshot: mocks.generatorSnapshot }));
vi.mock("@arc/meeting-processing-queue/meeting-answer", () => ({
  MEETING_ANSWER_PROMPT_VERSION: "meeting-answer-v1",
  enqueueMeetingAnswerJobs: mocks.enqueue,
  isMeetingAnswerQueueConfigured: mocks.isQueueConfigured,
}));
vi.mock("../authorized-meeting", () => ({
  loadAuthorizedMeeting: mocks.loadAuthorizedMeeting,
  meetingRole: mocks.meetingRole,
}));
vi.mock("../dao", () => ({ recordMeetingAudit: mocks.recordMeetingAudit }));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  askMeetingQuestion,
  createSavedMeetingQuestionThread,
  getSavedMeetingQuestionThread,
} from "./service";

const access = {
  meetingId: "meeting-81",
  memberRole: "member",
  organizationId: "org-81",
  userId: "user-81",
};

describe("Meeting Answer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAuthorizedMeeting.mockResolvedValue({ id: "meeting-81" });
    mocks.meetingRole.mockReturnValue("viewer");
    mocks.isQueueConfigured.mockReturnValue(true);
    mocks.generatorSnapshot.mockReturnValue({ model: "gpt-5-mini", provider: "mastra" });
  });

  it("allows a Viewer to create only their own thread", async () => {
    mocks.createThread.mockResolvedValue({ id: "thread-81", title: "新提问" });
    await expect(
      createSavedMeetingQuestionThread({ ...access, title: undefined }),
    ).resolves.toEqual({ id: "thread-81", title: "新提问" });
    expect(mocks.createThread).toHaveBeenCalledWith({
      createdBy: "user-81",
      meetingId: "meeting-81",
      organizationId: "org-81",
      title: "新提问",
    });
  });

  it("hides a thread after meeting access is revoked", async () => {
    mocks.loadAuthorizedMeeting.mockResolvedValue(null);
    await expect(
      getSavedMeetingQuestionThread({ ...access, threadId: "thread-81" }),
    ).resolves.toBeNull();
    expect(mocks.loadThread).not.toHaveBeenCalled();
  });

  it("persists one placeholder then enqueues its stable exchange id", async () => {
    mocks.createExchange.mockResolvedValue({ id: "exchange-81", status: "pending" });
    await expect(
      askMeetingQuestion({
        ...access,
        question: "谁负责支付迁移？",
        requestId: "00000000-0000-4000-8000-000000000081",
        threadId: "thread-81",
      }),
    ).resolves.toMatchObject({ id: "exchange-81", status: "pending" });
    expect(mocks.enqueue).toHaveBeenCalledWith([{ exchangeId: "exchange-81" }]);
  });

  it("does not persist a question when no answer worker is configured", async () => {
    mocks.isQueueConfigured.mockReturnValue(false);
    await expect(
      askMeetingQuestion({
        ...access,
        question: "谁负责支付迁移？",
        requestId: "00000000-0000-4000-8000-000000000081",
        threadId: "thread-81",
      }),
    ).resolves.toBe("unavailable");
    expect(mocks.createExchange).not.toHaveBeenCalled();
  });
});
