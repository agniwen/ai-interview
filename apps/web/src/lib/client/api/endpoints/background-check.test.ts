import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBackgroundCheckEmail } from "./background-check";

describe("sendBackgroundCheckEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends every selected attachment in a multipart request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        providerMessageId: "email-1",
        sentAt: "2026-09-21T00:00:00.000Z",
        url: "https://example.com/background-check/token",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendBackgroundCheckEmail("light", "candidate-1", {
      attachments: [
        new File(["first"], "授权书.pdf", { type: "application/pdf" }),
        new File(["second"], "说明.png", { type: "image/png" }),
      ],
      content: "请查看 https://example.com/background-check/token",
      subject: "背景调查信息采集",
      to: "candidate@example.com",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, request] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/api/w/light/studio/interviews/candidate-1/background-check/email");
    expect(request?.body).toBeInstanceOf(FormData);
    const body = request?.body;
    if (!(body instanceof FormData)) {
      throw new Error("Expected background-check email request body to be FormData");
    }
    expect(
      body.getAll("attachments").map((value) => (value instanceof File ? value.name : null)),
    ).toEqual(["授权书.pdf", "说明.png"]);
    expect(body.get("to")).toBe("candidate@example.com");
  });
});
