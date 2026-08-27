import { describe, expect, it } from "vitest";
import { canStartAiInterviewRound } from "./ai-interview-access";

describe("canStartAiInterviewRound", () => {
  it("allows legacy rounds that were created without a candidate invitation", () => {
    expect(
      canStartAiInterviewRound({
        candidateInviteExpiresAt: null,
        candidateInviteStatus: "pending",
        candidateInviteTokenHash: null,
        roundStatus: "pending",
      }),
    ).toBe(true);
  });

  it("requires an accepted current invitation before the first session starts", () => {
    const invitation = {
      candidateInviteExpiresAt: new Date("2026-08-28T00:00:00.000Z"),
      candidateInviteTokenHash: "current-token-hash",
      now: new Date("2026-08-27T00:00:00.000Z"),
      roundStatus: "pending" as const,
    };

    expect(canStartAiInterviewRound({ ...invitation, candidateInviteStatus: "declined" })).toBe(
      false,
    );
    expect(canStartAiInterviewRound({ ...invitation, candidateInviteStatus: "sent" })).toBe(false);
    expect(canStartAiInterviewRound({ ...invitation, candidateInviteStatus: "accepted" })).toBe(
      true,
    );
  });

  it("blocks an accepted invitation that expired before the first session", () => {
    expect(
      canStartAiInterviewRound({
        candidateInviteExpiresAt: new Date("2026-08-26T00:00:00.000Z"),
        candidateInviteStatus: "accepted",
        candidateInviteTokenHash: "current-token-hash",
        now: new Date("2026-08-27T00:00:00.000Z"),
        roundStatus: "pending",
      }),
    ).toBe(false);
  });

  it("allows an accepted candidate to reconnect after the invitation expiry", () => {
    expect(
      canStartAiInterviewRound({
        candidateInviteExpiresAt: new Date("2026-08-26T00:00:00.000Z"),
        candidateInviteStatus: "accepted",
        candidateInviteTokenHash: "current-token-hash",
        now: new Date("2026-08-27T00:00:00.000Z"),
        roundStatus: "interrupted",
      }),
    ).toBe(true);
  });
});
