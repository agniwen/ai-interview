import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadMeetingObject } from "./local-meeting-multipart";

describe("Meeting object upload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bounds a signed PUT so purge quiet periods can outlast every writer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadMeetingObject({
      body: new ReadableStream({ start: (controller) => controller.close() }),
      headers: { "content-type": "audio/webm" },
      sizeBytes: 0,
      url: "https://recordings.example.test/microphone.webm",
    });

    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    expect(request?.signal?.aborted).toBe(false);
  });
});
