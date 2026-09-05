import { describe, expect, it, vi } from "vitest";
import {
  isAllowedRecordingPlaybackUrl,
  readRecordingPlaybackBytes,
  registerMeetingPlaybackIpc,
} from "./meeting-playback";

const RECORDING_ORIGIN = "https://account.r2.cloudflarestorage.com";

describe("Meeting playback IPC", () => {
  it("allows only HTTPS recording URLs on the configured R2 origin", () => {
    expect(
      isAllowedRecordingPlaybackUrl(
        "https://bucket.account.r2.cloudflarestorage.com/meeting.webm?X-Amz-Signature=test",
        RECORDING_ORIGIN,
      ),
    ).toBe(true);
    expect(
      isAllowedRecordingPlaybackUrl("https://attacker.example/meeting.webm", RECORDING_ORIGIN),
    ).toBe(false);
    expect(
      isAllowedRecordingPlaybackUrl(
        "http://bucket.account.r2.cloudflarestorage.com/meeting.webm",
        RECORDING_ORIGIN,
      ),
    ).toBe(false);
  });

  it("loads recording bytes in the main process without renderer CORS", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-length": "3" },
        status: 200,
      }),
    );
    const url = "https://bucket.account.r2.cloudflarestorage.com/meeting.webm?X-Amz-Signature=test";

    const bytes = await readRecordingPlaybackBytes(url, RECORDING_ORIGIN, fetchImpl);

    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error" }));
  });

  it("rejects oversized recordings before buffering the response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { "content-length": String(513 * 1024 * 1024) },
        status: 200,
      }),
    );

    await expect(
      readRecordingPlaybackBytes(
        "https://bucket.account.r2.cloudflarestorage.com/meeting.webm",
        RECORDING_ORIGIN,
        fetchImpl,
      ),
    ).rejects.toThrow("录音文件过大");
  });

  it("rejects playback byte requests outside the trusted main frame", () => {
    const handle = vi.fn();
    registerMeetingPlaybackIpc(RECORDING_ORIGIN, () => false, { handle });
    const handler = handle.mock.calls.find(
      ([channel]) => channel === "meeting-playback:read-audio-bytes",
    )?.[1];

    expect(() =>
      handler?.(
        {},
        "https://bucket.account.r2.cloudflarestorage.com/meeting.webm?X-Amz-Signature=test",
      ),
    ).toThrow("不受信任的录音波形请求");
  });
});
