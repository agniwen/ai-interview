import { describe, expect, it } from "vitest";
import {
  HUMAN_INTERVIEW_CANDIDATE_MATERIALS_GRACE_MS,
  isHumanInterviewCandidateMaterialsAvailable,
} from "./dao";
import type { HumanInterviewCandidateMaterialsScope } from "./dao";

function scope(
  validUntil: string | null,
  status: HumanInterviewCandidateMaterialsScope["status"] = "scheduled",
): Pick<HumanInterviewCandidateMaterialsScope, "status" | "validUntil"> {
  return { status, validUntil };
}

describe("human interview candidate materials access", () => {
  const validUntil = Date.parse("2026-09-15T08:00:00.000Z");

  it("keeps candidate materials available for one hour after the meeting expires", () => {
    expect(
      isHumanInterviewCandidateMaterialsAvailable(
        scope(new Date(validUntil).toISOString()),
        validUntil + HUMAN_INTERVIEW_CANDIDATE_MATERIALS_GRACE_MS,
      ),
    ).toBe(true);
  });

  it("blocks materials after the grace window and for cancelled meetings", () => {
    expect(
      isHumanInterviewCandidateMaterialsAvailable(
        scope(new Date(validUntil).toISOString()),
        validUntil + HUMAN_INTERVIEW_CANDIDATE_MATERIALS_GRACE_MS + 1,
      ),
    ).toBe(false);
    expect(
      isHumanInterviewCandidateMaterialsAvailable(
        scope(new Date(validUntil).toISOString(), "cancelled"),
        validUntil,
      ),
    ).toBe(false);
    expect(isHumanInterviewCandidateMaterialsAvailable(scope(null), validUntil)).toBe(false);
  });
});
