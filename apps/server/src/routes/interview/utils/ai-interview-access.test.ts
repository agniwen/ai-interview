import { describe, expect, it } from "vitest";
import { resolveAiInterviewAccess } from "./ai-interview-access";

describe("resolveAiInterviewAccess", () => {
  it("allows legacy rounds that were created without a candidate invitation", () => {
    expect(
      resolveAiInterviewAccess({
        candidateInviteExpiresAt: null,
        candidateInviteStatus: "pending",
        candidateInviteTokenHash: null,
        roundStatus: "pending",
      }),
    ).toBe("allowed");
  });

  it("treats opening a current interview link as accepting the invitation", () => {
    const invitation = {
      candidateInviteExpiresAt: new Date("2026-08-28T00:00:00.000Z"),
      candidateInviteTokenHash: "current-token-hash",
      now: new Date("2026-08-27T00:00:00.000Z"),
      roundStatus: "pending" as const,
    };

    expect(resolveAiInterviewAccess({ ...invitation, candidateInviteStatus: "declined" })).toBe(
      "unavailable",
    );
    expect(resolveAiInterviewAccess({ ...invitation, candidateInviteStatus: "pending" })).toBe(
      "auto_accept",
    );
    expect(resolveAiInterviewAccess({ ...invitation, candidateInviteStatus: "sent" })).toBe(
      "auto_accept",
    );
    expect(resolveAiInterviewAccess({ ...invitation, candidateInviteStatus: "accepted" })).toBe(
      "allowed",
    );
  });

  it("blocks an invitation that expired before the first session", () => {
    expect(
      resolveAiInterviewAccess({
        candidateInviteExpiresAt: new Date("2026-08-26T00:00:00.000Z"),
        candidateInviteStatus: "sent",
        candidateInviteTokenHash: "current-token-hash",
        now: new Date("2026-08-27T00:00:00.000Z"),
        roundStatus: "pending",
      }),
    ).toBe("unavailable");
  });

  it("allows an accepted candidate to reconnect after the invitation expiry", () => {
    expect(
      resolveAiInterviewAccess({
        candidateInviteExpiresAt: new Date("2026-08-26T00:00:00.000Z"),
        candidateInviteStatus: "accepted",
        candidateInviteTokenHash: "current-token-hash",
        now: new Date("2026-08-27T00:00:00.000Z"),
        roundStatus: "interrupted",
      }),
    ).toBe("allowed");
  });
});
