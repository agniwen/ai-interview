import { describe, expect, it } from "vitest";
import { updateMeetingRecruitingContextSchema } from "./meeting-recording";

describe("meeting recording contracts", () => {
  it("accepts exactly one recruiting record id or an explicit unlink", () => {
    expect(
      updateMeetingRecruitingContextSchema.parse({ recruitingRecordId: "candidate-1" }),
    ).toEqual({ recruitingRecordId: "candidate-1" });
    expect(updateMeetingRecruitingContextSchema.parse({ recruitingRecordId: null })).toEqual({
      recruitingRecordId: null,
    });
    expect(
      updateMeetingRecruitingContextSchema.safeParse({ recruitingRecordId: "   " }).success,
    ).toBe(false);
  });
});
