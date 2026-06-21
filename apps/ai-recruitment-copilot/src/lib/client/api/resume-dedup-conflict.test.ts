import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { extractResumeDedupConflictMatches } from "./resume-dedup-conflict";

const MATCH = {
  candidateEmail: "candidate@example.com",
  candidateName: "候选人",
  candidatePhone: "13800138000",
  createdAt: "2026-06-21T00:00:00.000Z",
  id: "existing-resume",
  jobDescriptionName: null,
  status: "draft" as const,
  targetRole: "前端工程师",
};

describe("extractResumeDedupConflictMatches", () => {
  it("returns matches from duplicate_found 409 ApiError payloads", () => {
    const error = new ApiError("请求失败", {
      payload: { matches: [MATCH], status: "duplicate_found" },
      status: 409,
    });

    expect(extractResumeDedupConflictMatches(error)).toEqual([MATCH]);
  });

  it("returns null for non-duplicate errors", () => {
    const error = new ApiError("请求失败", {
      payload: { error: "bad request" },
      status: 400,
    });

    expect(extractResumeDedupConflictMatches(error)).toBeNull();
  });
});
