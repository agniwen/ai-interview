import { describe, expect, it, vi } from "vitest";
import { startInterviewSession } from "../interview-session-start";

function createSession() {
  const calls: string[] = [];
  const session = {
    room: {
      switchActiveDevice: vi.fn((_kind: string, deviceId: string) => {
        calls.push(`switch-microphone:${deviceId}`);
        return Promise.resolve(true);
      }),
    },
    start: vi.fn(() =>
      Promise.resolve().then(() => {
        calls.push("start-session");
      }),
    ),
  };

  return { calls, session };
}

describe("startInterviewSession", () => {
  it.each([
    { label: "voice start", startMuted: false },
    { label: "muted start", startMuted: true },
  ])("switches to the default microphone after $label", async ({ startMuted }) => {
    const { calls, session } = createSession();

    await startInterviewSession({
      recordingEnabled: false,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      session: session as never,
      startMuted,
    });

    expect(calls).toEqual(["start-session", "switch-microphone:default"]);
    expect(session.room.switchActiveDevice).toHaveBeenCalledWith("audioinput", "default", false);
  });

  it("captures the chosen microphone from the first track and keeps it after connecting", async () => {
    const { calls, session } = createSession();

    await startInterviewSession({
      microphoneDeviceId: "usb-mic",
      recordingEnabled: false,
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      session: session as never,
      startMuted: false,
    });

    expect(calls).toEqual([
      "switch-microphone:usb-mic",
      "start-session",
      "switch-microphone:usb-mic",
    ]);
  });
});
