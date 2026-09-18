import { afterEach, describe, expect, it, vi } from "vitest";
import { createHumanTranscriptionRouter } from "./route";
import { HumanTranscriptionConflictError } from "./errors";
import type { HumanTranscriptionCallback } from "@app/shared/human-transcription";

const job: HumanTranscriptionCallback = {
  executionId: "00000000-0000-4000-8000-000000000001",
  generation: 1,
  kind: "human_interview_transcription",
  meetingId: "meeting",
  organizationId: "org",
  roomName: "human_meeting_abc",
  runId: "run",
  schemaVersion: 1,
};
const claim = vi.fn(() =>
  Promise.resolve({
    hints: { context: [], vocabulary: {} },
    mode: "shadow",
    participants: {},
    startedAt: "2026-09-16T00:00:00.000Z",
    stop: false,
  }),
);
const router = createHumanTranscriptionRouter({
  append: () => Promise.resolve({ acknowledgedIds: [], cursor: 0, stop: false }),
  claim,
});
function request(secret: string, body: HumanTranscriptionCallback = job) {
  return router.request("/claim", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-Agent-Secret": secret },
    method: "POST",
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("internal human transcription callbacks", () => {
  it("rejects missing and incorrect credentials before claiming", async () => {
    vi.stubEnv("AGENT_CALLBACK_SECRET", "secret");
    const response = await request("wrong");
    expect(response.status).toBe(401);
    expect(claim).not.toHaveBeenCalled();
  });
  it("validates payload before claiming", async () => {
    vi.stubEnv("AGENT_CALLBACK_SECRET", "secret");
    const invalid = await request("secret", { ...job, generation: 0 });
    expect(invalid.status).toBe(400);
    const valid = await request("secret");
    expect(valid.status).toBe(200);
  });
  it("rejects callbacks without an execution identity", async () => {
    vi.stubEnv("AGENT_CALLBACK_SECRET", "secret");
    const { executionId: _executionId, ...metadata } = job;
    for (const path of ["/claim", "/events"]) {
      const response = await router.request(path, {
        body: JSON.stringify({ ...metadata, events: [] }),
        headers: { "Content-Type": "application/json", "X-Agent-Secret": "secret" },
        method: "POST",
      });
      expect(response.status).toBe(400);
    }
    expect(claim).not.toHaveBeenCalled();
  });
  it("returns a conflict when the task loses its generation", async () => {
    vi.stubEnv("AGENT_CALLBACK_SECRET", "secret");
    claim.mockRejectedValueOnce(new HumanTranscriptionConflictError("任务绑定或执行代次无效"));
    const response = await request("secret");
    expect(response.status).toBe(409);
  });
});
