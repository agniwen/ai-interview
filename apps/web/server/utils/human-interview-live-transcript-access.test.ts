import { describe, expect, it, vi } from "vitest";
import { authorizeHumanInterviewLiveTranscriptUpgrade } from "./human-interview-live-transcript-access";

function request(protocols: string, origin = "https://interview.example.com") {
  return new Request("https://interview.example.com/_human-interview-live-transcript", {
    headers: { Origin: origin, "Sec-WebSocket-Protocol": protocols },
  });
}

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

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

describe("authorizeHumanInterviewLiveTranscriptUpgrade", () => {
  it("authenticates the signed interviewer and claims the requested track", async () => {
    const inviteToken = "signed-token";
    const createAuthorization = vi.fn().mockResolvedValue({
      clientSecret: "temporary-provider-token",
      expiresAt: "2026-09-01T10:00:00.000Z",
      model: "qwen-audio-3.0-asr-flash-streaming",
      provider: "qwen",
      track: "microphone",
    });
    const result = await authorizeHumanInterviewLiveTranscriptUpgrade(
      request(
        [
          "arc-human-interview-transcript",
          `arc-invite.${encoded(inviteToken)}`,
          "arc-capture.79f5504c-bd45-4839-94bf-60d885f868ba",
          "arc-track.microphone",
          `arc-section.${encoded("79f5504c-bd45-4839-94bf-60d885f868ba:microphone:0")}`,
        ].join(", "),
      ),
      {
        createAuthorization,
        now: () => new Date("2026-08-31T10:00:00.000Z"),
        resolveInvite: vi.fn().mockResolvedValue(scope),
      },
    );
    expect(result.captureId).toBe("79f5504c-bd45-4839-94bf-60d885f868ba");
    expect(result.sectionId).toBe("79f5504c-bd45-4839-94bf-60d885f868ba:microphone:0");
    expect(result.authorization.clientSecret).toBe("temporary-provider-token");
    expect(result.authorization).toMatchObject({
      context: [expect.stringContaining("候选人：张三")],
      vocabulary: {
        "Frontend Lead": 4,
        React: 4,
        TanStack: 4,
        张三: 4,
        研发部: 4,
        高级前端工程师: 4,
      },
    });
    expect(createAuthorization).toHaveBeenCalledWith({
      captureId: result.captureId,
      organizationId: "org-1",
      track: "microphone",
      userId: "user-1",
    });
  });

  it("rejects observers and cross-origin websocket upgrades", async () => {
    const protocols = [
      "arc-human-interview-transcript",
      `arc-invite.${encoded("signed-token")}`,
      "arc-capture.79f5504c-bd45-4839-94bf-60d885f868ba",
      "arc-track.system",
      `arc-section.${encoded("79f5504c-bd45-4839-94bf-60d885f868ba:system:0")}`,
    ].join(", ");
    await expect(
      authorizeHumanInterviewLiveTranscriptUpgrade(request(protocols, "https://evil.example.com")),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      authorizeHumanInterviewLiveTranscriptUpgrade(request(protocols), {
        createAuthorization: vi.fn(),
        resolveInvite: vi.fn().mockResolvedValue({ ...scope, role: "observer" }),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("uses the same early-join and valid-until rules as the meeting room", async () => {
    const protocols = [
      "arc-human-interview-transcript",
      `arc-invite.${encoded("signed-token")}`,
      "arc-capture.79f5504c-bd45-4839-94bf-60d885f868ba",
      "arc-track.system",
      `arc-section.${encoded("79f5504c-bd45-4839-94bf-60d885f868ba:system:0")}`,
    ].join(", ");
    const dependencies = {
      createAuthorization: vi.fn(),
      now: () => new Date("2026-08-31T10:00:00.000Z"),
    };

    await expect(
      authorizeHumanInterviewLiveTranscriptUpgrade(request(protocols), {
        ...dependencies,
        resolveInvite: vi.fn().mockResolvedValue({
          ...scope,
          scheduledAt: "2026-08-31T10:10:01.000Z",
          status: "scheduled",
        }),
      }),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      authorizeHumanInterviewLiveTranscriptUpgrade(request(protocols), {
        ...dependencies,
        resolveInvite: vi.fn().mockResolvedValue({ ...scope, validUntil: null }),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(dependencies.createAuthorization).not.toHaveBeenCalled();
  });
});
