import { describe, expect, it } from "vitest";
import {
  updateMeetingMetadataSchema,
  updateMeetingRecruitingContextSchema,
} from "./meeting-recording";

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

  it("trims and bounds editable meeting titles", () => {
    expect(updateMeetingMetadataSchema.parse({ title: "  产品复盘  " })).toEqual({
      title: "产品复盘",
    });
    expect(updateMeetingMetadataSchema.safeParse({ title: "   " }).success).toBe(false);
    expect(updateMeetingMetadataSchema.safeParse({ title: "a".repeat(121) }).success).toBe(false);
  });
});
