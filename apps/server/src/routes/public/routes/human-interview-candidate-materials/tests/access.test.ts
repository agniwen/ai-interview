import { describe, expect, it } from "vitest";
import { isHumanInterviewCandidateMaterialsAvailable } from "../dao";
import type { HumanInterviewCandidateMaterialsScope } from "../dao";

function scope(
  validUntil: string | null,
  status: HumanInterviewCandidateMaterialsScope["status"] = "scheduled",
  endedAt: string | null = null,
): Pick<HumanInterviewCandidateMaterialsScope, "endedAt" | "status" | "validUntil"> {
  return { endedAt, status, validUntil };
}

describe("human interview candidate materials access", () => {
  const scheduledEnd = "2026-09-15T08:00:00.000Z";
  const dayLater = Date.parse("2026-09-16T08:00:00.000Z");

  it("uses the current scheduled end after a reschedule", () => {
    const now = Date.parse("2026-09-17T12:00:00.000Z");
    const rescheduledEnd = "2026-09-17T08:00:00.000Z";
    expect(isHumanInterviewCandidateMaterialsAvailable(scope(scheduledEnd), now)).toBe(false);
    expect(isHumanInterviewCandidateMaterialsAvailable(scope(rescheduledEnd), now)).toBe(true);
  });

  it.each(["scheduled", "not_held", "ended"] as const)(
    "uses scheduled end plus 24 hours for a %s meeting with no actual end recorded",
    (status) => {
      const meeting = scope(scheduledEnd, status);
      expect(isHumanInterviewCandidateMaterialsAvailable(meeting, dayLater - 1)).toBe(true);
      expect(isHumanInterviewCandidateMaterialsAvailable(meeting, dayLater)).toBe(false);
    },
  );

  it.each([
    ["2026-09-15T07:00:00.000Z", "2026-09-16T07:00:00.000Z"],
    ["2026-09-15T10:00:00.000Z", "2026-09-16T10:00:00.000Z"],
  ])("expires 24 hours after the actual end at %s", (endedAt, expiresAt) => {
    const meeting = scope(scheduledEnd, "ended", endedAt);
    const deadline = Date.parse(expiresAt);
    expect(isHumanInterviewCandidateMaterialsAvailable(meeting, deadline - 1)).toBe(true);
    expect(isHumanInterviewCandidateMaterialsAvailable(meeting, deadline)).toBe(false);
  });

  it("keeps materials available while the meeting is in progress", () => {
    expect(
      isHumanInterviewCandidateMaterialsAvailable(scope(scheduledEnd, "in_progress"), dayLater),
    ).toBe(true);
  });

  it("blocks cancelled meetings and scheduled meetings without an end time", () => {
    expect(
      isHumanInterviewCandidateMaterialsAvailable(
        scope(scheduledEnd, "cancelled"),
        Date.parse(scheduledEnd),
      ),
    ).toBe(false);
    expect(isHumanInterviewCandidateMaterialsAvailable(scope(null), dayLater)).toBe(false);
  });
});
