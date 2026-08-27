import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAiInterviewInvitationToSchedule,
  buildAiInterviewInvitationToken,
  buildResetAiInterviewInvitation,
  hashAiInterviewInvitationToken,
  isAiInterviewInvitationExpired,
  parseSignedAiInterviewInvitationToken,
  verifyAiInterviewInvitationToken,
} from "./ai-interview-invitation-access";

const previousSecret = process.env.BETTER_AUTH_SECRET;

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-at-least-thirty-two-characters";
});

afterEach(() => {
  if (previousSecret === undefined) {
    delete process.env.BETTER_AUTH_SECRET;
  } else {
    process.env.BETTER_AUTH_SECRET = previousSecret;
  }
});

describe("AI interview invitation token", () => {
  it("stores only a hash while keeping the signed token reproducible", () => {
    const now = new Date("2026-08-20T08:00:00.000Z");
    const schedule = addAiInterviewInvitationToSchedule({ id: "round_1" }, now);
    const token = buildAiInterviewInvitationToken({
      exp: schedule.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: schedule.id,
    });

    expect(schedule.candidateInviteTokenHash).toBe(hashAiInterviewInvitationToken(token));
    expect(schedule.candidateInviteTokenHash).toHaveLength(64);
    expect(verifyAiInterviewInvitationToken(token)).toMatchObject({ scheduleEntryId: "round_1" });
  });

  it("rejects a tampered token", () => {
    const token = buildAiInterviewInvitationToken({
      exp: Date.now() + 60_000,
      scheduleEntryId: "round_1",
    });
    expect(verifyAiInterviewInvitationToken(`${token}x`)).toBeNull();
  });

  it("keeps a valid signed payload available for an expired-invitation response", () => {
    const token = buildAiInterviewInvitationToken({
      exp: Date.now() - 60_000,
      scheduleEntryId: "round_expired",
    });

    expect(verifyAiInterviewInvitationToken(token)).toBeNull();
    expect(parseSignedAiInterviewInvitationToken(token)).toMatchObject({
      scheduleEntryId: "round_expired",
    });
  });

  it("refreshes invitation access when an AI interview round is reset", () => {
    const now = new Date("2026-08-27T00:00:00.000Z");
    const currentInvitation = addAiInterviewInvitationToSchedule(
      { id: "round_expired" },
      new Date("2026-07-01T00:00:00.000Z"),
    );
    const reset = buildResetAiInterviewInvitation({
      currentTokenHash: currentInvitation.candidateInviteTokenHash,
      invitationVersion: 3,
      now,
    });

    expect(reset).toMatchObject({
      candidateDeclineReason: null,
      candidateInviteStatus: "pending",
      candidateRespondedAt: null,
      invitationVersion: 4,
    });
    expect(reset.candidateInviteExpiresAt).toEqual(new Date("2026-09-26T00:00:00.000Z"));
    expect(reset.candidateInviteTokenHash).toBe(currentInvitation.candidateInviteTokenHash);
  });

  it("keeps legacy rounds without invitation tokens non-expiring during reset", () => {
    expect(
      buildResetAiInterviewInvitation({
        currentTokenHash: null,
        invitationVersion: 1,
        now: new Date("2026-08-27T00:00:00.000Z"),
      }),
    ).toMatchObject({
      candidateInviteExpiresAt: null,
      candidateInviteStatus: "pending",
      candidateInviteTokenHash: null,
      invitationVersion: 2,
    });
  });

  it("uses the stored expiry after reset instead of the original token expiry", () => {
    const now = new Date("2026-08-27T00:00:00.000Z");

    expect(isAiInterviewInvitationExpired(new Date("2026-09-26T00:00:00.000Z"), now)).toBe(false);
    expect(isAiInterviewInvitationExpired(now, now)).toBe(true);
  });
});
