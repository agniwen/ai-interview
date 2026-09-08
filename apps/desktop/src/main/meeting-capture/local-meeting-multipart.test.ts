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
      createBody: () => new ReadableStream({ start: (controller) => controller.close() }),
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

it("retries a reset connection with the complete recording bytes", async () => {
  const received: string[] = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    received.push(await new Response(init.body).text());
    if (received.length === 1) {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      });
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    await uploadMeetingObject({
      createBody: () => new Blob(["recording-bytes"]).stream(),
      headers: { "content-type": "audio/webm" },
      sizeBytes: 15,
      url: "https://recordings.example.test/microphone.webm",
    });
    expect(received).toEqual(["recording-bytes", "recording-bytes"]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([400, 403])("does not retry permanent HTTP %s failures", async (status) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    await expect(
      uploadMeetingObject({
        createBody: () => new Blob(["recording-bytes"]).stream(),
        headers: {},
        sizeBytes: 15,
        url: "https://recordings.example.test/microphone.webm",
      }),
    ).rejects.toThrow(`录音对象上传失败 (${status})`);
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("stops after three socket failures and keeps one deadline across attempts", async () => {
  const fetchMock = vi.fn().mockRejectedValue(
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  try {
    await expect(
      uploadMeetingObject({
        createBody: () => new Blob(["recording-bytes"]).stream(),
        headers: {},
        sizeBytes: 15,
        url: "https://recordings.example.test/microphone.webm",
      }),
    ).rejects.toThrow("已尝试 3 次");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Set(fetchMock.mock.calls.map(([, request]) => request.signal)).size).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("retries a transient HTTP response with a new upload stream", async () => {
  const received: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, request: RequestInit) => {
      received.push(await new Response(request.body).text());
      return new Response(null, { status: received.length === 1 ? 503 : 200 });
    }),
  );
  try {
    await uploadMeetingObject({
      createBody: () => new Blob(["recording-bytes"]).stream(),
      headers: {},
      sizeBytes: 15,
      url: "https://recordings.example.test/microphone.webm",
    });
    expect(received).toEqual(["recording-bytes", "recording-bytes"]);
  } finally {
    vi.unstubAllGlobals();
  }
});
