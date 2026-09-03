import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanInterviewTranscriptAttributionRouter } from "./transcript-attribution-route";

const mocks = {
  asset: vi.fn(),
  create: vi.fn(),
  load: vi.fn(),
  resolve: vi.fn(),
  sign: vi.fn(),
};
const router = createHumanInterviewTranscriptAttributionRouter(mocks);

const revisionId = "ac3661fc-9c41-4b34-8f56-74549a1cfa62";
const turnId = "55efbc70-c0ba-496b-bd67-9e3b4d462100";
const turn = {
  attribution: {
    method: "unconfirmed",
    participantIdentity: null,
    role: "unknown",
    sourceId: "room-file",
  },
  confidence: null,
  endMs: 2000,
  id: turnId,
  speakerKey: "remote-1",
  startMs: 1000,
  text: "原始发言",
  track: "remote",
};
const scope = { organizationId: "org", role: "host", status: "ended", userId: "actor" };

function confirm(assignments = [{ role: "candidate", turnId }], sourceRevisionId = revisionId) {
  return router.request("/invite/transcript-attribution", {
    body: JSON.stringify({ assignments, sourceRevisionId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue(scope);
  mocks.load.mockResolvedValue({
    meetingSessionId: "session",
    transcript: { id: revisionId, language: "zh", turns: [turn] },
  });
  mocks.create.mockResolvedValue({ id: "new-revision" });
});

describe("transcript attribution HTTP", () => {
  it("creates a scoped immutable revision without changing the original transcript", async () => {
    const response = await confirm();
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "actor",
        confirmedRoles: { [turnId]: "candidate" },
        correction: expect.objectContaining({
          sourceRevisionId: revisionId,
          turns: [
            expect.objectContaining({
              attribution: turn.attribution,
              speakerDisplayName: "候选人",
              text: turn.text,
            }),
          ],
        }),
        meetingId: "session",
        organizationId: "org",
      }),
    );
    expect(turn.attribution.role).toBe("unknown");
  });
  it.each([
    { code: 403, role: "observer", status: "ended" },
    { code: 409, role: "host", status: "in_progress" },
  ])("rejects $role / $status before writing", async ({ role, status, code }) => {
    mocks.resolve.mockResolvedValue({ ...scope, role, status });
    const response = await confirm();
    expect(response.status).toBe(code);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects invalid links, stale revisions, and foreign turns", async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    const invalid = await confirm();
    const stale = await confirm(undefined, turnId);
    const foreign = await confirm([{ role: "candidate", turnId: revisionId }]);
    expect(invalid.status).toBe(404);
    expect(stale.status).toBe(409);
    expect(foreign.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("signs only audio referenced by an authorized current transcript", async () => {
    const foreign = await router.request(`/invite/transcript-audio/${revisionId}`);
    expect(foreign.status).toBe(404);
    expect(mocks.asset).not.toHaveBeenCalled();
    mocks.asset.mockResolvedValue({
      durationMs: 5000,
      recordingIdentity: { offsetMs: 500 },
      storageKey: "room.ogg",
    });
    mocks.sign.mockResolvedValue("https://example.test/signed-audio");
    const response = await router.request(`/invite/transcript-audio/${turnId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      endSeconds: 1.5,
      startSeconds: 0.5,
      url: "https://example.test/signed-audio",
    });
    expect(mocks.asset).toHaveBeenCalledWith("session", "room-file");
    expect(mocks.sign).toHaveBeenCalledWith("room.ogg", 300);
  });
});
