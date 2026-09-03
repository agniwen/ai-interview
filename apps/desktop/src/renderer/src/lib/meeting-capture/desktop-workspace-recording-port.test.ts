import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/api-error";
import { DesktopWorkspaceRecordingPort } from "./desktop-workspace-recording-port";
import type { DesktopWorkspaceRecordingPortDependencies } from "./desktop-workspace-recording-port";

const apiJsonMock = vi.fn();
const resolveActiveWorkspaceMock =
  vi.fn<DesktopWorkspaceRecordingPortDependencies["resolveActiveWorkspace"]>();

function createDependencies(
  meetingCapture: DesktopWorkspaceRecordingPortDependencies["meetingCapture"],
): DesktopWorkspaceRecordingPortDependencies {
  return {
    apiJson: apiJsonMock,
    apiUrl: (path) => path,
    meetingCapture,
    resolveActiveWorkspace: resolveActiveWorkspaceMock,
  };
}

describe("DesktopWorkspaceRecordingPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveActiveWorkspaceMock.mockResolvedValue({ id: "org-84", name: "Org", slug: "org" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renews the server capacity lease while a direct upload remains active", async () => {
    vi.useFakeTimers();
    const upload = Promise.withResolvers<undefined>();
    const resolveUpload = upload.resolve.bind(null, undefined);
    const meetingCapture = {
      describeMultipartWorkspaceSave: vi.fn(),
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
      discard: vi.fn(),
      uploadMultipart: vi.fn(),
      uploadSmall: vi.fn(() => upload.promise),
    } satisfies DesktopWorkspaceRecordingPortDependencies["meetingCapture"];
    apiJsonMock.mockImplementation((url: string) => {
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

    const persisted = new DesktopWorkspaceRecordingPort(createDependencies(meetingCapture)).persist(
      {
        captureId: "capture-85",
        manifestSha256: "a".repeat(64),
        report: vi.fn(),
      },
    );
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(apiJsonMock).toHaveBeenCalledWith(
      "/api/w/org/meetings/capture-85/upload-heartbeat",
      "续期录音上传租约失败",
      { method: "POST" },
    );
    resolveUpload();
    await expect(persisted).resolves.toEqual({
      recoveryCopyDeleteAfter: "2026-08-10T00:00:00.000Z",
    });
  });

  it("deletes the local recovery copy when a purge tombstone rejects Save", async () => {
    const discard = vi.fn((_captureId: string) => Promise.resolve());
    const meetingCapture = {
      describeMultipartWorkspaceSave: vi.fn(),
      describeWorkspaceSave: vi.fn().mockResolvedValue({
        assets: [],
        id: "capture-84",
        manifestSha256: "a".repeat(64),
      }),
      discard,
      uploadMultipart: vi.fn(),
      uploadSmall: vi.fn(),
    } satisfies DesktopWorkspaceRecordingPortDependencies["meetingCapture"];
    apiJsonMock.mockRejectedValue(
      new ApiError("purged", { payload: { code: "meeting-purged" }, status: 409 }),
    );

    await expect(
      new DesktopWorkspaceRecordingPort(createDependencies(meetingCapture)).persist({
        captureId: "capture-84",
        manifestSha256: "a".repeat(64),
        report: vi.fn(),
      }),
    ).rejects.toThrow("本地恢复副本也已删除");
    expect(discard).toHaveBeenCalledWith("capture-84");
  });

  it("omits local word timing metadata from the workspace save request", async () => {
    const meetingCapture = {
      describeMultipartWorkspaceSave: vi.fn(),
      describeWorkspaceSave: vi.fn().mockResolvedValue({
        assets: [],
        id: "capture-86",
        liveTranscriptDraft: {
          capturedAt: "2026-08-28T03:00:00.000Z",
          droppedAudioMs: 0,
          droppedPcmFrames: 0,
          error: null,
          sections: [
            {
              id: "section-1",
              sequence: 0,
              startedAt: "2026-08-28T02:59:58.000Z",
              track: "microphone",
            },
          ],
          turns: [
            {
              correctionModel: "qwen-plus",
              endMs: 920,
              final: true,
              id: "turn-1",
              originalText: "我们开始把。",
              sectionId: "section-1",
              startMs: 170,
              text: "我们开始吧。",
              track: "microphone",
              words: [
                {
                  endMs: 295,
                  punctuation: "",
                  startMs: 170,
                  text: "我们",
                },
              ],
            },
          ],
        },
        manifestSha256: "a".repeat(64),
      }),
      discard: vi.fn(),
      uploadMultipart: vi.fn(),
      uploadSmall: vi.fn(),
    } satisfies DesktopWorkspaceRecordingPortDependencies["meetingCapture"];
    apiJsonMock.mockResolvedValue({
      recoveryCopyDeleteAfter: "2026-08-29T03:00:00.000Z",
      state: "workspace-verified",
    });

    await new DesktopWorkspaceRecordingPort(createDependencies(meetingCapture)).persist({
      captureId: "capture-86",
      manifestSha256: "a".repeat(64),
      report: vi.fn(),
    });

    const body = JSON.parse(String(apiJsonMock.mock.calls[0]?.[2]?.body));
    expect(body.liveTranscriptDraft.turns[0]).toEqual({
      correctionModel: "qwen-plus",
      final: true,
      id: "turn-1",
      originalText: "我们开始把。",
      sectionId: "section-1",
      text: "我们开始吧。",
      track: "microphone",
    });
  });
});
