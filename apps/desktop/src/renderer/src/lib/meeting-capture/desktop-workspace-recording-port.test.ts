import { expect, it, vi } from "vitest";
import { DesktopWorkspaceRecordingPort } from "./desktop-workspace-recording-port";
import type { EchoProcessingStatus } from "../../../../preload/echo-processing-api";

function status(
  state: EchoProcessingStatus["state"],
  backupVerifiedAt: string | null = null,
): EchoProcessingStatus {
  return {
    audioReleased: false,
    backupVerifiedAt,
    error: null,
    meetingId: "capture",
    state,
    tasks: [],
  };
}
it("observes durable Main progress without issuing upload or model requests", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(status("processing"))
    .mockResolvedValueOnce(status("processing", "2026-09-09T00:00:00.000Z"));
  const api = vi.fn();
  const wait = vi.fn(() => Promise.resolve());
  const port = new DesktopWorkspaceRecordingPort({
    apiJson: api,
    apiUrl: (path) => path,
    processing: { status: read },
    wait,
  });
  expect(
    await port.persist({ captureId: "capture", manifestSha256: "hash", report: vi.fn() }),
  ).toEqual({ recoveryCopyDeleteAfter: "2026-09-09T00:00:00.000Z" });
  expect(wait).toHaveBeenCalledTimes(1);
  expect(api).not.toHaveBeenCalled();
});
it.each(["paused", "failed", "unbound"] as const)(
  "does not reset %s tasks just because a window reopens",
  async (state) => {
    const read = vi.fn().mockResolvedValue(status(state));
    const port = new DesktopWorkspaceRecordingPort({
      apiJson: vi.fn(),
      apiUrl: (path) => path,
      processing: { status: read },
      wait: vi.fn(),
    });
    await expect(
      port.persist({ captureId: "capture", manifestSha256: "hash", report: vi.fn() }),
    ).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  },
);
