import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanInterviewChatRouter } from "./route";

const scope = {
  canRead: true,
  meetingId: "meeting-1",
  organizationId: "organization-1",
  participantIdentity: "candidate_round-1",
  scheduledAt: null,
  senderName: "候选人",
  status: "in_progress",
  validUntil: "2099-01-01T00:00:00.000Z",
};

const mocks = {
  list: vi.fn(),
  resolveCandidate: vi.fn(),
  resolveInterviewer: vi.fn(),
  save: vi.fn(),
};

const input = { id: "00000000-0000-4000-8000-000000000001", message: "你好" };

function app() {
  return createHumanInterviewChatRouter(mocks);
}

describe("human interview chat routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveCandidate.mockResolvedValue(scope);
    mocks.resolveInterviewer.mockResolvedValue({
      ...scope,
      participantIdentity: "interviewer_user-1",
      senderName: "面试官",
    });
    mocks.list.mockResolvedValue([]);
    mocks.save.mockResolvedValue({ ...input, participantIdentity: scope.participantIdentity });
  });

  it("loads only messages scoped to the signed candidate meeting", async () => {
    const response = await app().request("/candidate-token/chat-messages");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.resolveCandidate).toHaveBeenCalledWith("candidate-token");
    expect(mocks.list).toHaveBeenCalledWith(scope);
  });

  it("saves the server-resolved sender identity for both invite roles", async () => {
    for (const [path, identity] of [
      ["/candidate-token/chat-messages", "candidate_round-1"],
      ["/interviewer/interviewer-token/chat-messages", "interviewer_user-1"],
    ]) {
      const response = await app().request(path, {
        body: JSON.stringify(input),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(201);
      expect(mocks.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: input.id,
          meetingId: scope.meetingId,
          message: input.message,
          organizationId: scope.organizationId,
          participantIdentity: identity,
        }),
      );
    }
  });

  it("blocks access before candidate acceptance and after meeting end", async () => {
    mocks.resolveCandidate.mockResolvedValue({ ...scope, canRead: false });
    const unreadable = await app().request("/candidate-token/chat-messages");
    expect(unreadable.status).toBe(403);
    mocks.resolveCandidate.mockResolvedValue({ ...scope, status: "ended" });
    const ended = await app().request("/candidate-token/chat-messages", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(ended.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects invalid messages and conflicting ids", async () => {
    const invalid = await app().request("/candidate-token/chat-messages", {
      body: JSON.stringify({ ...input, message: "  " }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(invalid.status).toBe(400);
    mocks.save.mockResolvedValue(null);
    const conflict = await app().request("/candidate-token/chat-messages", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(conflict.status).toBe(409);
  });
});
