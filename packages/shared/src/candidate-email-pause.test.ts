import { describe, expect, it } from "vitest";
import {
  CANDIDATE_INTERVIEW_EMAILS_ENABLED,
  canSendInterviewNotificationToAudience,
} from "./interview-notifications";

describe("candidate interview email emergency pause", () => {
  it("disables candidate sends regardless of event or previous confirmation", () => {
    expect(CANDIDATE_INTERVIEW_EMAILS_ENABLED).toBe(false);
    expect(canSendInterviewNotificationToAudience("candidate")).toBe(false);
  });
  it.each(["initiator_fallback", "meeting_interviewer", "selected_hr"])(
    "preserves internal %s notifications",
    (audience) => {
      expect(canSendInterviewNotificationToAudience(audience)).toBe(true);
    },
  );
});
