import { describe, expect, it, vi } from "vitest";
import { startInterviewSession } from "../interview-session-start";

function createSession() {
  const calls: string[] = [];
  const session = {
    room: {
      switchActiveDevice: vi.fn(() => {
        calls.push("switch-default-microphone");
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
      session: session as never,
      startMuted,
    });

    expect(calls).toEqual(["start-session", "switch-default-microphone"]);
    expect(session.room.switchActiveDevice).toHaveBeenCalledWith("audioinput", "default", false);
  });
});
