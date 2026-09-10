import { describe, expect, it } from "vitest";
import { findEffectiveAiRound } from "./effective-ai-round";

describe("current AI round selection", () => {
  const old = {
    candidateInviteExpiresAt: "2026-10-10",
    id: "old",
    interviewLink: "/interview/old",
    sortOrder: 0,
  };
  const current = {
    candidateInviteExpiresAt: null,
    id: "current",
    interviewLink: "/interview/current",
    sortOrder: 0,
  };
  const historical = { ...old, id: "historical" };
  const nodes = [{ effectiveAiRoundId: "current", node: "ai_interview" as const }];

  it("uses the effective reference even when old rounds are last and all sort orders match", () => {
    expect(findEffectiveAiRound([current, historical, old], nodes)).toBe(current);
    expect(findEffectiveAiRound([old, current, historical], nodes)).toBe(current);
  });
  it("keeps the link and expiry from the same current round", () => {
    expect(findEffectiveAiRound([current, old], nodes)).toMatchObject({
      candidateInviteExpiresAt: null,
      interviewLink: "/interview/current",
    });
  });
  it("never copies a historical link after rollback clears the effective reference", () => {
    expect(
      findEffectiveAiRound([current, old], [{ effectiveAiRoundId: null, node: "ai_interview" }]),
    ).toBeNull();
  });
  it("does not fall back while the new round list is still loading", () => {
    expect(findEffectiveAiRound([old], nodes)).toBeNull();
    expect(findEffectiveAiRound([], nodes)).toBeNull();
    expect(findEffectiveAiRound([old])).toBeNull();
  });
  it("keeps a passed AI result available for later-stage review using its retained reference", () => {
    expect(
      findEffectiveAiRound(
        [current, old],
        [...nodes, { effectiveAiRoundId: null, node: "second_interview" }],
      ),
    ).toBe(current);
  });
});
