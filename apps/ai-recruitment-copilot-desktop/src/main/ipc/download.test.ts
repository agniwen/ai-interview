import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { isAllowedMeetingExportDownloadUrl, registerDownloadIpc } from "./download";

describe("Meeting export download IPC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows only the bounded authenticated Meeting export endpoint", () => {
    expect(
      isAllowedMeetingExportDownloadUrl(
        "https://interview.example/api/w/demo/meetings/meeting-83/exports/audio?track=system",
        "https://interview.example",
      ),
    ).toBe(true);
    expect(
      isAllowedMeetingExportDownloadUrl(
        "http://localhost:3000/api/w/demo/meetings/meeting-83/exports/json",
        "http://localhost:3000",
      ),
    ).toBe(true);
    expect(
      isAllowedMeetingExportDownloadUrl(
        "https://attacker.example/payload.dmg",
        "https://interview.example",
      ),
    ).toBe(false);
    expect(
      isAllowedMeetingExportDownloadUrl(
        "https://attacker.example/api/w/demo/meetings/meeting-83/exports/json",
        "https://interview.example",
      ),
    ).toBe(false);
  });

  it("uses the invoking webContents session downloader instead of renderer navigation", () => {
    registerDownloadIpc("https://interview.example");
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === "download:start")?.[1];
    const downloadURL = vi.fn();
    const url = "https://interview.example/api/w/demo/meetings/meeting-83/exports/markdown";
    expect(handler?.({ sender: { downloadURL } }, url)).toBe(true);
    expect(downloadURL).toHaveBeenCalledWith(url);
  });
});
