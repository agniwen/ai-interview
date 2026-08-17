import { describe, expect, it, vi } from "vitest";
import { registerMeetingCaptureMediaSessionHandlers } from "./media-session";

interface TestContents {
  mainFrame: { url: string };
}

describe("registerMeetingCaptureMediaSession", () => {
  it("allows display media checks only from the trusted main document", () => {
    const contents: TestContents = { mainFrame: { url: "http://localhost:5173/" } };
    let permissionCheckHandler:
      | ((
          contents: TestContents | null,
          permission: string,
          requestingOrigin: string,
          details: { isMainFrame: boolean; mediaType?: string; requestingUrl?: string },
        ) => boolean)
      | undefined;
    let permissionRequestHandler:
      | ((
          contents: TestContents,
          permission: string,
          callback: (granted: boolean) => void,
          details: { isMainFrame: boolean; mediaTypes?: string[]; requestingUrl?: string },
        ) => void)
      | undefined;
    const setDisplayMediaRequestHandler = vi.fn();
    registerMeetingCaptureMediaSessionHandlers({
      getMainWindowWebContents: () => contents,
      getSources: () => Promise.resolve([{ id: "screen:1" }]),
      setDisplayMediaRequestHandler,
      setPermissionCheckHandler: (handler) => {
        permissionCheckHandler = handler;
      },
      setPermissionRequestHandler: (handler) => {
        permissionRequestHandler = handler;
      },
    });

    expect(permissionCheckHandler).toBeDefined();
    expect(
      permissionCheckHandler?.(contents, "media", "http://localhost:5173", {
        isMainFrame: true,
        requestingUrl: "http://localhost:5173/",
      }),
    ).toBe(true);
    expect(
      permissionCheckHandler?.(contents, "media", "http://attacker.invalid", {
        isMainFrame: false,
        requestingUrl: "http://attacker.invalid/",
      }),
    ).toBe(false);

    const callback = vi.fn();
    permissionRequestHandler?.(contents, "media", callback, {
      isMainFrame: true,
      mediaTypes: [],
      requestingUrl: "http://localhost:5173/",
    });
    expect(callback).toHaveBeenCalledWith(true);
  });
});
