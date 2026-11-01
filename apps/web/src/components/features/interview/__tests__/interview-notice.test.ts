import { describe, expect, it } from "vitest";
import { buildInterviewNoticeItems } from "../interview-notice";

function mentionsRecording(recordingEnabled: boolean) {
  return buildInterviewNoticeItems(recordingEnabled).some((item) => item.text.includes("录像"));
}

describe("buildInterviewNoticeItems", () => {
  it("discloses recording only when the round records video", () => {
    expect(mentionsRecording(true)).toBe(true);
    expect(mentionsRecording(false)).toBe(false);
  });
});
