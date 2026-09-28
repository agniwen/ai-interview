// @vitest-environment jsdom
/* oxlint-disable anti-slop/no-module-mocking -- Device switching is verified without opening physical microphones. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ButtonGroup } from "@/components/ui/button-group";
import { MicrophoneDeviceMenu } from "./human-meeting-audio-controls";

// SAFETY: React's test-only act flag belongs to the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const media = vi.hoisted(() => ({
  activeDeviceId: "default",
  devices: [
    { deviceId: "default", label: "内置麦克风" },
    { deviceId: "usb", label: "USB 麦克风" },
  ],
  setActiveMediaDevice: vi.fn(),
}));
vi.mock("@livekit/components-react", () => ({
  useMediaDeviceSelect: () => media,
  useRoomContext: vi.fn(),
}));
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("innerWidth", 437);
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  media.setActiveMediaDevice.mockReset().mockImplementation(() => Promise.resolve());
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function openDevices() {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() =>
    root.render(
      <ButtonGroup>
        <button>麦克风</button>
        <MicrophoneDeviceMenu />
      </ButtonGroup>,
    ),
  );
  const trigger = container.querySelector<HTMLButtonElement>('button[aria-label^="选择麦克风"]');
  expect(trigger?.textContent).toBe(window.innerWidth < 768 ? "麦克风设备" : "");
  expect(trigger?.getAttribute("aria-label")).toContain("当前麦克风：内置麦克风");
  expect(trigger?.querySelector("svg")).not.toBeNull();
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  await act(() => trigger?.click());
  expect(container.querySelector("button[aria-label]")?.getAttribute("aria-expanded")).toBe("true");
}

it("shows mobile microphone radios and closes after a successful device switch", async () => {
  await openDevices();
  expect(document.querySelector('[data-slot="drawer-content"]')).not.toBeNull();
  expect(
    document.querySelector('[role="radio"][aria-checked="true"]')?.closest("label")?.textContent,
  ).toBe("内置麦克风");
  await act(() => document.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]?.click());
  expect(media.setActiveMediaDevice).toHaveBeenCalledWith("usb");
  expect(document.querySelector('[data-slot="drawer-content"][data-state="open"]')).toBeNull();
  expect(
    document.querySelector('button[aria-label^="选择麦克风"]')?.getAttribute("aria-expanded"),
  ).toBe("false");
});

it("keeps the drawer and previous selection when switching fails", async () => {
  media.setActiveMediaDevice.mockRejectedValue(new Error("设备不可用"));
  await openDevices();
  await act(() => document.querySelectorAll<HTMLButtonElement>('[role="radio"]')[1]?.click());
  expect(media.setActiveMediaDevice).toHaveBeenCalledWith("usb");
  expect(document.querySelector('[data-slot="drawer-content"][data-state="open"]')).not.toBeNull();
  expect(
    document.querySelector('[role="radio"][aria-checked="true"]')?.closest("label")?.textContent,
  ).toBe("内置麦克风");
});

it("keeps the desktop dropdown", async () => {
  vi.stubGlobal("innerWidth", 1280);
  await openDevices();
  expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
  expect(document.querySelector('[role="menu"]')?.textContent).toContain("USB 麦克风");
  await act(() =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find((item) => item.textContent === "USB 麦克风")
      ?.click(),
  );
  expect(media.setActiveMediaDevice).toHaveBeenCalledWith("usb");
  expect(
    document.querySelector('button[aria-label^="选择麦克风"]')?.getAttribute("aria-expanded"),
  ).toBe("false");
});
