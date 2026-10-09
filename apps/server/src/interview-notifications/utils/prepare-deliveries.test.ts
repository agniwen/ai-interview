import { describe, expect, it } from "vitest";
import {
  resolvePreferredInternalNotificationChannel,
  shouldResolveInitiatorAudience,
  shouldResolveSelectedHrAudience,
  usesInterviewerMeetingLink,
} from "./prepare-deliveries";

describe("internal interview notification channel", () => {
  it("preserves the system review link but keeps invitation links for meetings", () => {
    expect(usesInterviewerMeetingLink("human_evaluation_summary_ready")).toBe(false);
    expect(usesInterviewerMeetingLink("human_interview_confirmed")).toBe(true);
    expect(usesInterviewerMeetingLink("human_interviewer_confirmation_requested")).toBe(true);
  });
  it("prefers Feishu for a bound account", () => {
    expect(resolvePreferredInternalNotificationChannel(true)).toBe("feishu");
  });

  it("falls back to email for an account without Feishu", () => {
    expect(resolvePreferredInternalNotificationChannel(false)).toBe("email");
  });
});

describe("human interview HR recipient policy", () => {
  it("never resolves selected HR recipients for human meeting events", () => {
    expect(shouldResolveSelectedHrAudience({ humanMeetingId: "meeting_1" })).toBe(false);
    expect(shouldResolveSelectedHrAudience({ humanMeetingId: null })).toBe(true);
  });

  it("keeps the HR creator on candidate feedback and suppresses duplicate confirmation", () => {
    expect(
      shouldResolveInitiatorAudience({
        humanMeetingId: "meeting_1",
        type: "human_invitation_accepted",
      }),
    ).toBe(true);
    expect(
      shouldResolveInitiatorAudience({
        humanMeetingId: "meeting_1",
        type: "human_interview_confirmed",
      }),
    ).toBe(false);
  });
});
