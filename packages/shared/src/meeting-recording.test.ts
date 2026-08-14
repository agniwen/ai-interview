import { describe, expect, it } from "vitest";
import {
  RECORDING_TITLE_MAX_LENGTH,
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
    expect(
      updateMeetingMetadataSchema.safeParse({ title: "a".repeat(RECORDING_TITLE_MAX_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      updateMeetingMetadataSchema.safeParse({ title: "a".repeat(RECORDING_TITLE_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });
});
