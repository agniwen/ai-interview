import { describe, expect, it, vi } from "vitest";
import { createHumanInterviewLiveTranscriptRouter } from "./route";

const captureId = "79f5504c-bd45-4839-94bf-60d885f868ba";
const scope = {
  candidateName: "张三",
  jobDescriptionDepartmentName: "研发部",
  jobDescriptionName: "高级前端工程师",
  organizationId: "org-1",
  resumeSkills: ["React", "TanStack"],
  role: "interviewer" as const,
  scheduledAt: "2026-08-31T09:00:00.000Z",
  status: "in_progress" as const,
  targetRole: "Frontend Lead",
  userId: "user-1",
  validUntil: "2026-09-01T10:00:00.000Z",
};

describe("human interview live transcript public route", () => {
  it("authorizes a signed interviewer through the public API", async () => {
    const createAuthorization = vi.fn().mockResolvedValue({
      clientSecret: "temporary-provider-token",
      expiresAt: "2026-09-01T10:00:00.000Z",
      model: "qwen-audio-3.0-asr-flash-streaming",
      provider: "qwen",
      track: "microphone",
    });
    const app = createHumanInterviewLiveTranscriptRouter({
      createAuthorization,
      now: () => new Date("2026-08-31T10:00:00.000Z"),
      resolveInvite: vi.fn().mockResolvedValue(scope),
    });

    const response = await app.request("/signed-token/live-transcript", {
      body: JSON.stringify({ captureId, track: "microphone" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      authorization: {
        clientSecret: "temporary-provider-token",
        context: [expect.stringContaining("候选人：张三")],
        vocabulary: { React: 4, TanStack: 4, 张三: 4 },
      },
    });
    expect(createAuthorization).toHaveBeenCalledWith({
      captureId,
      organizationId: "org-1",
      track: "microphone",
      userId: "user-1",
    });
  });

  it("keeps observer and meeting-time checks inside the server route", async () => {
    const createAuthorization = vi.fn();
    const observerApp = createHumanInterviewLiveTranscriptRouter({
      createAuthorization,
      resolveInvite: vi.fn().mockResolvedValue({ ...scope, role: "observer" }),
    });
    const earlyApp = createHumanInterviewLiveTranscriptRouter({
      createAuthorization,
      now: () => new Date("2026-08-31T10:00:00.000Z"),
      resolveInvite: vi.fn().mockResolvedValue({
        ...scope,
        scheduledAt: "2026-08-31T10:10:01.000Z",
        status: "scheduled",
      }),
    });
    const init = {
      body: JSON.stringify({ captureId, track: "system" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    };

    const observerResponse = await observerApp.request("/signed-token/live-transcript", init);
    const earlyResponse = await earlyApp.request("/signed-token/live-transcript", init);
    expect(observerResponse.status).toBe(403);
    expect(earlyResponse.status).toBe(403);
    expect(createAuthorization).not.toHaveBeenCalled();
  });

  it("renews and releases leases using the invite-bound scope", async () => {
    const heartbeat = vi.fn().mockResolvedValue(true);
    const release = vi.fn(async () => {});
    const app = createHumanInterviewLiveTranscriptRouter({
      heartbeat,
      now: () => new Date("2026-08-31T10:00:00.000Z"),
      release,
      resolveInvite: vi.fn().mockResolvedValue(scope),
    });

    const heartbeatResponse = await app.request(
      `/signed-token/live-transcript/${captureId}/heartbeat`,
      { method: "POST" },
    );
    const releaseResponse = await app.request(`/signed-token/live-transcript/${captureId}`, {
      method: "DELETE",
    });

    expect(heartbeatResponse.status).toBe(204);
    expect(releaseResponse.status).toBe(204);
    expect(heartbeat).toHaveBeenCalledWith({
      captureId,
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(release).toHaveBeenCalledWith({
      captureId,
      organizationId: "org-1",
      userId: "user-1",
    });
  });
});
