import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMeetingCaptureMediaSession } from "./ipc";

const mocks = vi.hoisted(() => {
  type PermissionCheckHandler = (
    contents: unknown,
    permission: string,
    requestingOrigin: string,
    details: {
      isMainFrame: boolean;
      mediaType?: string;
      requestingUrl?: string;
    },
  ) => boolean;
  type PermissionRequestHandler = (
    contents: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details: {
      isMainFrame: boolean;
      mediaTypes?: string[];
      requestingUrl?: string;
    },
  ) => void;

  return {
    contents: {
      mainFrame: { url: "http://localhost:5173/" },
    },
    permissionCheckHandler: null as PermissionCheckHandler | null,
    permissionRequestHandler: null as PermissionRequestHandler | null,
    setDisplayMediaRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn((handler: PermissionCheckHandler) => {
      mocks.permissionCheckHandler = handler;
    }),
    setPermissionRequestHandler: vi.fn((handler: PermissionRequestHandler) => {
      mocks.permissionRequestHandler = handler;
    }),
  };
});

vi.mock("electron", () => ({
  desktopCapturer: { getSources: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  session: {
    defaultSession: {
      setDisplayMediaRequestHandler: mocks.setDisplayMediaRequestHandler,
      setPermissionCheckHandler: mocks.setPermissionCheckHandler,
      setPermissionRequestHandler: mocks.setPermissionRequestHandler,
    },
  },
}));

vi.mock("../window", () => ({
  getMainWindowWebContents: () => mocks.contents,
}));

describe("registerMeetingCaptureMediaSession", () => {
  beforeEach(() => {
    mocks.permissionCheckHandler = null;
    mocks.permissionRequestHandler = null;
    mocks.setPermissionCheckHandler.mockClear();
  });

  it("allows display media checks only from the trusted main document", () => {
    registerMeetingCaptureMediaSession();

    const check = mocks.permissionCheckHandler;
    expect(check).not.toBeNull();
    expect(
      check?.(mocks.contents, "media", "http://localhost:5173", {
        isMainFrame: true,
        requestingUrl: "http://localhost:5173/",
      }),
    ).toBe(true);
    expect(
      check?.(mocks.contents, "media", "http://attacker.invalid", {
        isMainFrame: false,
        requestingUrl: "http://attacker.invalid/",
      }),
    ).toBe(false);

    const request = mocks.permissionRequestHandler;
    const callback = vi.fn();
    request?.(mocks.contents, "media", callback, {
      isMainFrame: true,
      mediaTypes: [],
      requestingUrl: "http://localhost:5173/",
    });
    expect(callback).toHaveBeenCalledWith(true);
  });
});
