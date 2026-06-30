import { describe, expect, it, vi } from "vitest";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { listDuplicateMatchesForSource, toDuplicateMatchInsertRows } from "./duplicate-matches";

const MATCH: DedupMatchRecord = {
  candidateEmail: "dup@example.com",
  candidateName: "重复候选人",
  candidatePhone: "13800138000",
  conflictingSignals: ["姓名相近"],
  createdAt: "2026-06-30T00:00:00.000Z",
  id: "target-resume-id",
  jobDescriptionName: null,
  level: "high",
  score: 92,
  semanticReasons: ["项目经历高度相似"],
  similarity: {
    resumeOverview: 0.91,
    skillRole: 0.88,
    workProject: 0.94,
  },
  status: "draft",
  targetRole: "前端工程师",
};

describe("toDuplicateMatchInsertRows", () => {
  it("maps semantic matches to active duplicate rows", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");

    expect(
      toDuplicateMatchInsertRows({
        embeddingVersion: "v1",
        matches: [MATCH],
        organizationId: "org-id",
        sourceId: "source-id",
        sourceType: "studio_interview",
      }),
    ).toEqual([
      {
        embeddingVersion: "v1",
        id: "00000000-0000-4000-8000-000000000000",
        level: "high",
        matchedSourceId: "target-resume-id",
        matchedSourceType: "studio_interview",
        organizationId: "org-id",
        reasons: ["项目经历高度相似"],
        score: 92,
        signals: ["姓名相近"],
        similarity: {
          resumeOverview: 0.91,
          skillRole: 0.88,
          workProject: 0.94,
        },
        sourceId: "source-id",
        sourceType: "studio_interview",
        status: "active",
      },
    ]);
  });

  it("keeps the matched source type from pool matches", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
    const poolMatch: DedupMatchRecord = {
      ...MATCH,
      id: "target-pool-id",
      sourceType: "resume_pool_item",
      status: "active",
    };

    expect(
      toDuplicateMatchInsertRows({
        embeddingVersion: "v1",
        matches: [poolMatch],
        organizationId: "org-id",
        sourceId: "source-pool-id",
        sourceType: "resume_pool_item",
      })[0],
    ).toMatchObject({
      matchedSourceId: "target-pool-id",
      matchedSourceType: "resume_pool_item",
      sourceId: "source-pool-id",
      sourceType: "resume_pool_item",
    });
  });
});

describe("listDuplicateMatchesForSource", () => {
  it("is exported for duplicate badge detail endpoints", () => {
    expect(listDuplicateMatchesForSource).toBeTypeOf("function");
  });
});
