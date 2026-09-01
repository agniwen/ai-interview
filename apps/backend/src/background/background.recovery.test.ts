import { describe, expect, it, vi } from "vitest";
import { BackgroundRecoveryService } from "./background.recovery.js";

describe("BackgroundRecoveryService", () => {
  it("only delegates lifecycle and diagnostics to owner schedulers", async () => {
    const snapshot = { "meeting-answer": { running: false } };
    const candidate = {
      close: vi.fn(() => Promise.resolve()),
      start: vi.fn(() => Promise.resolve()),
    };
    const meetings = {
      close: vi.fn(() => Promise.resolve()),
      getSnapshot: vi.fn(() => snapshot),
      start: vi.fn(() => Promise.resolve()),
    };
    // SAFETY: these focused mocks implement every dependency method exercised by the facade.
    const recovery = new BackgroundRecoveryService(candidate as never, meetings as never);

    await recovery.start({ transcription: true });
    expect(candidate.start).toHaveBeenCalledOnce();
    expect(meetings.start).toHaveBeenCalledWith({ transcription: true });
    expect(recovery.getSnapshot()).toBe(snapshot);
    await recovery.close();
    expect(candidate.close).toHaveBeenCalledOnce();
    expect(meetings.close).toHaveBeenCalledOnce();
  });
});
