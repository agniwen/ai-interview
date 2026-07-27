import { describe, expect, it, vi } from "vitest";
import {
  humanInterviewKeys,
  invalidateHumanInterviewCandidateQueries,
  studioCalendarKeys,
} from "@/lib/client/api/query-keys";

describe("humanInterviewKeys", () => {
  it("builds stable hierarchical keys for candidate human interview data", () => {
    expect(humanInterviewKeys.rounds("acme", "candidate_1")).toEqual([
      "human-interview-rounds",
      "acme",
      "candidate_1",
    ]);
    expect(humanInterviewKeys.meetings("acme", "candidate_1")).toEqual([
      "human-interview-meetings",
      "acme",
      "candidate_1",
    ]);
    expect(humanInterviewKeys.studioResumes()).toEqual(["studio-resumes"]);
  });

  it("invalidates rounds, meetings, and resume-library aggregates together", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(null);

    await invalidateHumanInterviewCandidateQueries(
      { invalidateQueries },
      { candidateId: "candidate_1", slug: "acme" },
    );

    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["human-interview-rounds", "acme", "candidate_1"],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["human-interview-meetings", "acme", "candidate_1"],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: ["studio-resumes"],
    });
  });
});

describe("studioCalendarKeys", () => {
  it("scopes cached events by workspace and visible range", () => {
    expect(studioCalendarKeys.range("acme", "2026-07-01", "2026-08-01")).toEqual([
      "studio-calendar",
      "acme",
      "2026-07-01",
      "2026-08-01",
    ]);
  });
});
