import { describe, expect, it, vi } from "vitest";
import { authorizeHumanInterviewLiveTranscriptUpgrade } from "./human-interview-live-transcript-access";

function request(protocols: string, origin = "https://interview.example.com") {
  return new Request("https://interview.example.com/_human-interview-live-transcript", {
    headers: { Origin: origin, "Sec-WebSocket-Protocol": protocols },
  });
}

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

describe("authorizeHumanInterviewLiveTranscriptUpgrade", () => {
  it("authenticates the signed interviewer and claims the requested track", async () => {
    const inviteToken = "signed-token";
    const authorize = vi.fn().mockResolvedValue({
      clientSecret: "temporary-provider-token",
      context: ["候选人：张三"],
      expiresAt: "2026-09-01T10:00:00.000Z",
      model: "qwen-audio-3.0-asr-flash-streaming",
      provider: "qwen",
      track: "microphone",
      vocabulary: { React: 4, 张三: 4 },
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
      { authorize },
    );
    expect(result.captureId).toBe("79f5504c-bd45-4839-94bf-60d885f868ba");
    expect(result.sectionId).toBe("79f5504c-bd45-4839-94bf-60d885f868ba:microphone:0");
    expect(result.authorization.clientSecret).toBe("temporary-provider-token");
    expect(result.authorization).toMatchObject({
      context: [expect.stringContaining("候选人：张三")],
      vocabulary: {
        React: 4,
        张三: 4,
      },
    });
    expect(authorize).toHaveBeenCalledWith({
      captureId: result.captureId,
      inviteToken,
      request: expect.any(Request),
      track: "microphone",
    });
    expect(result.inviteToken).toBe(inviteToken);
  });

  it("rejects cross-origin websocket upgrades before calling the API", async () => {
    const protocols = [
      "arc-human-interview-transcript",
      `arc-invite.${encoded("signed-token")}`,
      "arc-capture.79f5504c-bd45-4839-94bf-60d885f868ba",
      "arc-track.system",
      `arc-section.${encoded("79f5504c-bd45-4839-94bf-60d885f868ba:system:0")}`,
    ].join(", ");
    const authorize = vi.fn();
    await expect(
      authorizeHumanInterviewLiveTranscriptUpgrade(request(protocols, "https://evil.example.com"), {
        authorize,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(authorize).not.toHaveBeenCalled();
  });

  it("propagates authorization failures returned by the server API", async () => {
    const protocols = [
      "arc-human-interview-transcript",
      `arc-invite.${encoded("signed-token")}`,
      "arc-capture.79f5504c-bd45-4839-94bf-60d885f868ba",
      "arc-track.system",
      `arc-section.${encoded("79f5504c-bd45-4839-94bf-60d885f868ba:system:0")}`,
    ].join(", ");
    await expect(
      authorizeHumanInterviewLiveTranscriptUpgrade(request(protocols), {
        authorize: vi.fn().mockRejectedValue(
          new Response("旁听人员不能开启实时字幕。", {
            status: 403,
          }),
        ),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
