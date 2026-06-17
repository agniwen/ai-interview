import { describe, expect, it } from "vitest";
import { resolveCandidateQuestionGenerationEnabled } from "@arc/shared/interview/candidate-question-generation-config";

describe("candidate question generation config", () => {
  it("enables candidate-specific question generation by default", () => {
    expect(resolveCandidateQuestionGenerationEnabled({})).toBe(true);
    expect(
      resolveCandidateQuestionGenerationEnabled({
        NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: undefined,
      }),
    ).toBe(true);
  });

  it("disables candidate-specific question generation only when the env value is false", () => {
    expect(
      resolveCandidateQuestionGenerationEnabled({
        NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: "false",
      }),
    ).toBe(false);
    expect(
      resolveCandidateQuestionGenerationEnabled({
        NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: "true",
      }),
    ).toBe(true);
  });
});
