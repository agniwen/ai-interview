import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAiInterviewInvitationToSchedule,
  buildAiInterviewInvitationToken,
  hashAiInterviewInvitationToken,
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
});
