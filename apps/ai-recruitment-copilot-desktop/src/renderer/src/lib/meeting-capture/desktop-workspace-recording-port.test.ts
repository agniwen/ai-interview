import { beforeEach, describe, expect, it, vi } from "vitest";
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
