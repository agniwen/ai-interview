import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/api-error";

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  resolveActiveWorkspace: vi.fn(),
}));

vi.mock("@/lib/client/workspace", () => ({
  resolveActiveWorkspace: mocks.resolveActiveWorkspace,
}));
vi.mock("@/lib/client/rpc", () => ({ apiUrl: (path: string) => path }));
vi.mock("@/lib/client/rpc-fetch", () => ({ apiJson: mocks.apiJson }));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { DesktopWorkspaceRecordingPort } from "./desktop-workspace-recording-port";

describe("DesktopWorkspaceRecordingPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActiveWorkspace.mockResolvedValue({ id: "org-84", name: "Org", slug: "org" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renews the server capacity lease while a direct upload remains active", async () => {
    vi.useFakeTimers();
    const upload = Promise.withResolvers<null>();
    vi.stubGlobal("window", {
      api: {
        meetingCapture: {
          describeWorkspaceSave: vi.fn().mockResolvedValue({
            assets: [
              {
                contentType: "audio/webm;codecs=opus",
                durationMs: 60_000,
                fragmentCount: 1,
                sha256: "b".repeat(64),
                sizeBytes: 1024,
                track: "microphone",
              },
            ],
            id: "capture-85",
            manifestSha256: "a".repeat(64),
          }),
          uploadSmall: vi.fn(() => upload.promise),
        },
      },
    });
    mocks.apiJson.mockImplementation((url: string) => {
      if (url.endsWith("/upload-heartbeat")) {
        return Promise.resolve(null);
      }
      if (url.endsWith("/complete")) {
        return Promise.resolve({ recoveryCopyDeleteAfter: "2026-08-10T00:00:00.000Z" });
      }
      return Promise.resolve({
        state: "uploading",
        uploads: [
          {
            headers: { "content-type": "audio/webm;codecs=opus" },
            method: "PUT",
            track: "microphone",
            url: "https://recording.example/microphone",
          },
        ],
      });
    });

    const persisted = new DesktopWorkspaceRecordingPort().persist({
      captureId: "capture-85",
      manifestSha256: "a".repeat(64),
      report: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(mocks.apiJson).toHaveBeenCalledWith(
      "/api/w/org/meetings/capture-85/upload-heartbeat",
      "续期录音上传租约失败",
      { method: "POST" },
    );
    upload.resolve(null);
    await expect(persisted).resolves.toEqual({
      recoveryCopyDeleteAfter: "2026-08-10T00:00:00.000Z",
    });
  });

  it("deletes the local recovery copy when a purge tombstone rejects Save", async () => {
    const discard = vi.fn((_captureId: string) => Promise.resolve());
    vi.stubGlobal("window", {
      api: {
        meetingCapture: {
          describeWorkspaceSave: vi.fn().mockResolvedValue({
            assets: [],
            id: "capture-84",
            manifestSha256: "a".repeat(64),
          }),
          discard,
        },
      },
    });
    mocks.apiJson.mockRejectedValue(
      new ApiError("purged", { payload: { code: "meeting-purged" }, status: 409 }),
    );

    await expect(
      new DesktopWorkspaceRecordingPort().persist({
        captureId: "capture-84",
        manifestSha256: "a".repeat(64),
        report: vi.fn(),
      }),
    ).rejects.toThrow("本地恢复副本也已删除");
    expect(discard).toHaveBeenCalledWith("capture-84");
  });
});
