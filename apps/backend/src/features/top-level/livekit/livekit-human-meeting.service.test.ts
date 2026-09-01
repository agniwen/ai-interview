import { describe, expect, it } from "vitest";
import { liveKitLifecycleUpdate } from "./livekit-human-meeting.service.js";

describe("liveKitLifecycleUpdate", () => {
  it("does not regress an ended meeting when room_started is replayed", () => {
    expect(
      liveKitLifecycleUpdate({
        currentOccurredAt: new Date("2026-09-01T00:10:00.000Z"),
        currentStatus: "ended",
        event: "room_started",
        occurredAt: new Date("2026-09-01T00:11:00.000Z"),
        startedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("ignores an older lifecycle observation", () => {
    expect(
      liveKitLifecycleUpdate({
        currentOccurredAt: new Date("2026-09-01T00:10:00.000Z"),
        currentStatus: "in_progress",
        event: "room_finished",
        occurredAt: new Date("2026-09-01T00:09:00.000Z"),
        startedAt: new Date("2026-09-01T00:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
