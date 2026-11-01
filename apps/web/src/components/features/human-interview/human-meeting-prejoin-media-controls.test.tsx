// @vitest-environment jsdom

import { Room } from "livekit-client";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  defaultHumanMeetingPrejoinMediaSettings,
  HumanMeetingPrejoinMediaControls,
} from "./human-meeting-prejoin-media-controls";

// SAFETY: React's test-only act flag is intentionally attached to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Fixture() {
  const [settings, setSettings] = useState(defaultHumanMeetingPrejoinMediaSettings);
  return <HumanMeetingPrejoinMediaControls onChange={setSettings} settings={settings} />;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("selects a microphone before joining and shows the current device", async () => {
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const getLocalDevices = vi.spyOn(Room, "getLocalDevices").mockResolvedValue([
    {
      deviceId: "usb-mic",
      groupId: "usb",
      kind: "audioinput",
      label: "USB 麦克风",
      toJSON: () => ({}),
    },
  ]);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(<Fixture />));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label^="选择麦克风"]');
    expect(trigger?.getAttribute("aria-label")).toContain("系统默认麦克风");
    await act(() => trigger?.click());
    expect(getLocalDevices).toHaveBeenCalledWith("audioinput", true);
    await act(() =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "USB 麦克风")
        ?.click(),
    );
    expect(trigger?.getAttribute("aria-label")).toContain("USB 麦克风");
  } finally {
    await act(() => root.unmount());
  }
});
