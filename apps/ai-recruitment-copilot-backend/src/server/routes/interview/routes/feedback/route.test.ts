import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

const mocks = vi.hoisted(() => ({
  loadCandidateInterviewRecord: vi.fn(),
  submitCandidateInterviewFeedback: vi.fn(),
}));

vi.mock("../../utils", () => ({
  loadCandidateInterviewRecord: mocks.loadCandidateInterviewRecord,
}));

vi.mock("./dao", () => ({
  submitCandidateInterviewFeedback: mocks.submitCandidateInterviewFeedback,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { candidateInterviewFeedbackRouter } from "./route";

const payload = {
  categories: ["audio", "network"],
  detail: "面试过程中声音断断续续，并且发生过一次网络重连。",
};

function makeApp() {
  return factory.createApp().route("/", candidateInterviewFeedbackRouter);
}

describe("candidate interview feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCandidateInterviewRecord.mockResolvedValue({
      currentRoundId: "round_1",
      currentRoundStatus: "completed",
    });
  });

  it("submits feedback once for a completed AI interview round", async () => {
    const feedback = {
      ...payload,
      submittedAt: "2026-08-03T08:00:00.000Z",
    };
    mocks.submitCandidateInterviewFeedback.mockResolvedValue(feedback);

    const response = await makeApp().request("/candidate_1/round_1/feedback", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ feedback });
    expect(mocks.submitCandidateInterviewFeedback).toHaveBeenCalledWith({
      ...payload,
      interviewRecordId: "candidate_1",
      roundId: "round_1",
    });
  });

  it("rejects a second submission without overwriting the first", async () => {
    mocks.submitCandidateInterviewFeedback.mockResolvedValue(null);

    const response = await makeApp().request("/candidate_1/round_1/feedback", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "本轮反馈已提交，无法再次修改。" });
  });

  it("accepts feedback only after the round is completed", async () => {
    mocks.loadCandidateInterviewRecord.mockResolvedValue({
      currentRoundId: "round_1",
      currentRoundStatus: "in_progress",
    });

    const response = await makeApp().request("/candidate_1/round_1/feedback", {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "本轮面试尚未结束，暂时无法提交反馈。",
    });
    expect(mocks.submitCandidateInterviewFeedback).not.toHaveBeenCalled();
  });

  it("validates categories and detail before writing feedback", async () => {
    const response = await makeApp().request("/candidate_1/round_1/feedback", {
      body: JSON.stringify({ categories: [], detail: "太短" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(mocks.submitCandidateInterviewFeedback).not.toHaveBeenCalled();
  });
});
