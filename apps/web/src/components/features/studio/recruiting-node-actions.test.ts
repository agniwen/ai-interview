import { describe, expect, it } from "vitest";
import { canConfirmRecruitingNode, getRecruitingProgressOptions } from "./recruiting-node-actions";

describe("recruiting node confirmation availability", () => {
  it("hides AI confirmation until the effective round has ended", () => {
    expect(canConfirmRecruitingNode("ai_interview")).toBe(false);
    expect(
      canConfirmRecruitingNode("ai_interview", {
        effectiveAiRoundId: null,
        status: "awaiting_review",
      }),
    ).toBe(false);
    for (const status of ["pending", "scheduled", "in_progress", "completed"] as const) {
      expect(
        canConfirmRecruitingNode("ai_interview", { effectiveAiRoundId: "round", status }),
      ).toBe(false);
    }
    expect(
      canConfirmRecruitingNode("ai_interview", {
        effectiveAiRoundId: "round",
        status: "awaiting_review",
      }),
    ).toBe(true);
  });
  it.each(["second_interview", "final_interview"] as const)(
    "requires an ended effective human round at %s",
    (stage) => {
      expect(canConfirmRecruitingNode(stage)).toBe(false);
      for (const status of ["pending", "scheduled", "in_progress", "completed"] as const) {
        expect(
          canConfirmRecruitingNode(stage, {
            effectiveAiRoundId: null,
            effectiveHumanRoundId: "round",
            status,
          }),
        ).toBe(false);
      }
      expect(
        canConfirmRecruitingNode(stage, {
          effectiveAiRoundId: null,
          effectiveHumanRoundId: "round",
          status: "awaiting_review",
        }),
      ).toBe(true);
    },
  );
  it("hides manual offer updates once acceptance completes negotiation", () => {
    expect(
      canConfirmRecruitingNode("offer", { effectiveAiRoundId: null, status: "completed" }),
    ).toBe(false);
    expect(
      canConfirmRecruitingNode("offer", { effectiveAiRoundId: null, status: "negotiating" }),
    ).toBe(true);
  });
  it.each(["income_proof", "background_check", "onboarding"] as const)(
    "hides completed %s decisions",
    (stage) => {
      expect(
        canConfirmRecruitingNode(stage, { effectiveAiRoundId: null, status: "completed" }),
      ).toBe(false);
      expect(getRecruitingProgressOptions(stage, "completed")).toEqual([]);
    },
  );
  it("prevents sent offers from being reset through manual progress", () => {
    expect(getRecruitingProgressOptions("offer", "awaiting_response")).toEqual([]);
    expect(getRecruitingProgressOptions("offer", "negotiating")).toContain("negotiating");
  });
  it("keeps other active stage actions and excludes screening or closed", () => {
    expect(canConfirmRecruitingNode("screening")).toBe(false);
    expect(canConfirmRecruitingNode("closed")).toBe(false);
    expect(canConfirmRecruitingNode("income_proof")).toBe(true);
    expect(canConfirmRecruitingNode("onboarding")).toBe(true);
  });
});
