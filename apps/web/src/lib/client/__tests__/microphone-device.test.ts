import { describe, expect, it } from "vitest";
import {
  resolveActiveMicrophoneLabel,
  resolvePreferredMicrophoneDeviceId,
} from "@/lib/client/microphone-device";

describe("resolveActiveMicrophoneLabel", () => {
  const devices = [
    { deviceId: "default", label: "MacBook Pro 麦克风" },
    { deviceId: "usb-mic", label: "External USB Microphone" },
  ];

  it("uses the label of the currently active microphone", () => {
    expect(resolveActiveMicrophoneLabel(devices, "usb-mic")).toBe("External USB Microphone");
  });

  it("falls back safely while device labels are unavailable", () => {
    expect(resolveActiveMicrophoneLabel([], "default")).toBe("系统默认麦克风");
    expect(resolveActiveMicrophoneLabel([], "usb-mic")).toBe("当前麦克风");
  });

  it("keeps the default selection when LiveKit reports its physical device id", () => {
    expect(resolvePreferredMicrophoneDeviceId("default", "built-in-mic")).toBe("default");
  });

  it("resets the selection when the room explicitly switches back to default", () => {
    expect(resolvePreferredMicrophoneDeviceId("usb-mic", "default")).toBe("default");
  });
});
