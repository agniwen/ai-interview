// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyMediaError,
  resolveInterviewStartAvailability,
  toMicrophoneOptions,
  useInterviewDevicePermissions,
} from "../interview-device-permissions";

// SAFETY: React test environment flag for act().
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Devices = ReturnType<typeof useInterviewDevicePermissions>;

function mediaDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return { deviceId, groupId: "", kind, label, toJSON: () => ({}) };
}

function namedError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

interface FakeStream {
  getTracks: () => {
    addEventListener: () => void;
    getSettings: () => { deviceId?: string };
    label: string;
    stop: () => void;
  }[];
}

function fakeStream(label: string) {
  const track = {
    addEventListener: vi.fn(),
    getSettings: () => ({ deviceId: "usb-mic" }),
    label,
    stop: vi.fn(),
  };
  const stream: FakeStream = { getTracks: () => [track] };
  return { stream, track };
}

function stubMedia({
  getUserMedia,
  permission,
}: {
  getUserMedia: () => Promise<FakeStream>;
  permission: PermissionState | "unsupported";
}) {
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(getUserMedia) },
    permissions: {
      query: vi.fn(() =>
        permission === "unsupported"
          ? Promise.reject(new TypeError("unsupported permission name"))
          : Promise.resolve({
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
              state: permission,
            }),
      ),
    },
  });
}

function Probe({
  cameraEnabled,
  onRender,
}: {
  cameraEnabled: boolean;
  onRender: (devices: Devices) => void;
}) {
  onRender(useInterviewDevicePermissions({ cameraEnabled }));
  return null;
}

async function renderDevices(cameraEnabled = false) {
  let latest: Devices | undefined;
  const root = createRoot(document.createElement("div"));
  await act(() =>
    root.render(
      <Probe
        cameraEnabled={cameraEnabled}
        onRender={(devices) => {
          latest = devices;
        }}
      />,
    ),
  );
  await act(() => Promise.resolve());
  return { current: () => latest, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("interview device permissions", () => {
  it("only allows a voice start once the microphone is granted, keeping muted start available", () => {
    expect(
      resolveInterviewStartAvailability({ isBusy: false, microphoneStatus: "denied" }),
    ).toEqual({ mutedStartDisabled: false, voiceStartDisabled: true });
    expect(
      resolveInterviewStartAvailability({ isBusy: false, microphoneStatus: "granted" }),
    ).toEqual({ mutedStartDisabled: false, voiceStartDisabled: false });
    expect(
      resolveInterviewStartAvailability({ isBusy: true, microphoneStatus: "granted" }),
    ).toEqual({ mutedStartDisabled: true, voiceStartDisabled: true });
  });

  it("separates blocked permissions from missing or busy devices", () => {
    expect(classifyMediaError("microphone", "NotAllowedError").status).toBe("denied");
    expect(classifyMediaError("camera", "NotFoundError").status).toBe("unavailable");
    expect(classifyMediaError("microphone", "NotReadableError").status).toBe("unavailable");
  });

  it("lists only identifiable microphones and names unlabelled ones", () => {
    expect(
      toMicrophoneOptions([
        mediaDevice("audioinput", "default", "默认 - MacBook"),
        mediaDevice("audioinput", "", ""),
        mediaDevice("videoinput", "cam", "Camera"),
        mediaDevice("audioinput", "usb", ""),
      ]),
    ).toEqual([
      { deviceId: "default", label: "默认 - MacBook" },
      { deviceId: "usb", label: "麦克风 2" },
    ]);
  });

  it("opens a preview stream without prompting when access was already granted", async () => {
    const { stream, track } = fakeStream("USB Mic");
    stubMedia({ getUserMedia: () => Promise.resolve(stream), permission: "granted" });
    const { current, root } = await renderDevices();

    expect(current()?.microphone).toMatchObject({ label: "USB Mic", status: "granted" });

    await act(() => current()?.release());
    expect(track.stop).toHaveBeenCalled();
    expect(current()?.microphone).toMatchObject({ status: "granted", stream: null });
    await act(() => root.unmount());
  });

  it("waits for the candidate before prompting and reports a blocked request", async () => {
    const getUserMedia = vi.fn(() => Promise.reject(namedError("NotAllowedError")));
    stubMedia({ getUserMedia, permission: "unsupported" });
    const { current, root } = await renderDevices();

    expect(current()?.microphone.status).toBe("prompt");
    expect(getUserMedia).not.toHaveBeenCalled();

    await act(() => current()?.request("microphone"));
    expect(current()?.microphone.status).toBe("denied");
    await act(() => root.unmount());
  });

  it("checks the camera only when the round records video", async () => {
    stubMedia({ getUserMedia: () => Promise.reject(new Error("unused")), permission: "prompt" });
    const withoutCamera = await renderDevices(false);
    expect(withoutCamera.current()?.camera.status).toBe("checking");
    await act(() => withoutCamera.root.unmount());

    const withCamera = await renderDevices(true);
    expect(withCamera.current()?.camera.status).toBe("prompt");
    await act(() => withCamera.root.unmount());
  });
});
