import { describe, expect, it, vi } from "vitest";
import type { DedupMatchRecord } from "@app/server/server/routes/studio/routes/interviews/dao/studio-interviews";
import {
  aggregateDuplicateMatchSummaries,
  deleteDuplicateMatchesForSource,
  isDuplicateMatchVisibleToSource,
  listDuplicateMatchesForSource,
  resolveDuplicateMatchRows,
  toDuplicateMatchInsertRows,
} from "./duplicate-matches";

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
  status: "active",
  targetRole: "前端工程师",
};

// 方向行 fixture：默认两侧都是招聘台记录，可覆盖类型测试人才库侧。
// Direction-row fixture; defaults both sides to studio records.
const directionRow = (input: {
  matchedSourceId: string;
  matchedSourceType?: "resume_pool_item" | "studio_interview";
  sourceId: string;
  sourceType?: "resume_pool_item" | "studio_interview";
}) => ({
  matchedSourceId: input.matchedSourceId,
  matchedSourceType: input.matchedSourceType ?? "studio_interview",
  sourceId: input.sourceId,
  sourceType: input.sourceType ?? "studio_interview",
});

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

describe("isDuplicateMatchVisibleToSource", () => {
  it("hides talent-pool matches from recruiting records", () => {
    expect(isDuplicateMatchVisibleToSource("studio_interview", "resume_pool_item")).toBe(false);
    expect(isDuplicateMatchVisibleToSource("studio_interview", "studio_interview")).toBe(true);
  });

  it("keeps the talent pool's existing cross-source comparison", () => {
    expect(isDuplicateMatchVisibleToSource("resume_pool_item", "studio_interview")).toBe(true);
  });
});

describe("resolveDuplicateMatchRows", () => {
  it("resolves an earlier duplicate when the subject is the row source", () => {
    const input = directionRow({
      matchedSourceId: "older",
      sourceId: "first",
    });

    expect(resolveDuplicateMatchRows("first", [input])).toEqual([
      {
        otherId: "older",
        otherType: "studio_interview",
        row: input,
      },
    ]);
  });

  it("resolves a later duplicate when the subject is the matched side", () => {
    // later upload flagged first as its duplicate → row source=later, matched=first.
    const input = directionRow({
      matchedSourceId: "first",
      sourceId: "later",
    });

    expect(resolveDuplicateMatchRows("first", [input])).toEqual([
      {
        otherId: "later",
        otherType: "studio_interview",
        row: input,
      },
    ]);
  });

  it("dedupes a pair that has both directions", () => {
    const resolved = resolveDuplicateMatchRows("first", [
      directionRow({
        matchedSourceId: "second",
        sourceId: "first",
      }),
      directionRow({
        matchedSourceId: "first",
        sourceId: "second",
      }),
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ otherId: "second", otherType: "studio_interview" });
  });

  it("keeps the match source type from either side of the row", () => {
    const resolved = resolveDuplicateMatchRows("first", [
      directionRow({
        matchedSourceId: "pool-item",
        matchedSourceType: "resume_pool_item",
        sourceId: "first",
      }),
    ]);

    expect(resolved[0]).toMatchObject({ otherId: "pool-item", otherType: "resume_pool_item" });
  });

  it("skips rows that do not involve the subject and self-matches", () => {
    expect(
      resolveDuplicateMatchRows("first", [
        directionRow({
          matchedSourceId: "unrelated",
          sourceId: "other",
        }),
        directionRow({
          matchedSourceId: "first",
          sourceId: "first",
        }),
      ]),
    ).toEqual([]);
  });
});

describe("aggregateDuplicateMatchSummaries", () => {
  it("deduplicates pairs while preserving bidirectional summaries", () => {
    const result = aggregateDuplicateMatchSummaries([
      {
        level: "high",
        otherCreatedAt: null,
        otherCreatorName: null,
        otherId: "first",
        score: 96,
        subjectId: "later",
      },
      {
        level: "high",
        otherCreatedAt: null,
        otherCreatorName: null,
        otherId: "later",
        score: 96,
        subjectId: "first",
      },
      {
        level: "high",
        otherCreatedAt: null,
        otherCreatorName: null,
        otherId: "later",
        score: 94,
        subjectId: "first",
      },
    ]);

    expect(result.get("first")).toEqual({ count: 1, highestLevel: "high" });
    expect(result.get("later")).toEqual({ count: 1, highestLevel: "high" });
  });

  it("counts only matches scoring at least 90 as duplicates", () => {
    const result = aggregateDuplicateMatchSummaries([
      {
        level: "high",
        otherCreatedAt: "2026-08-18T04:20:00.000Z",
        otherCreatorImage: "https://example.com/heye.png",
        otherCreatorName: "荷叶",
        otherId: "duplicate-90",
        score: 90,
        subjectId: "current",
      },
      {
        level: "medium",
        otherCreatedAt: "2026-08-19T04:20:00.000Z",
        otherCreatorName: "达里尔",
        otherId: "similar-89",
        score: 89,
        subjectId: "current",
      },
    ]);

    expect(result.get("current")).toEqual({
      count: 1,
      highestLevel: "high",
      latestMatchedResume: {
        createdAt: "2026-08-18T04:20:00.000Z",
        creatorImage: "https://example.com/heye.png",
        creatorName: "荷叶",
      },
    });
  });

  it("uses the most recently created match among true duplicates", () => {
    const result = aggregateDuplicateMatchSummaries([
      {
        level: "high",
        otherCreatedAt: "2026-08-17T04:20:00.000Z",
        otherCreatorName: "荷叶",
        otherId: "duplicate-96",
        score: 96,
        subjectId: "current",
      },
      {
        level: "high",
        otherCreatedAt: "2026-08-18T04:20:00.000Z",
        otherCreatorName: "达里尔",
        otherId: "duplicate-94",
        score: 94,
        subjectId: "current",
      },
      {
        level: "medium",
        otherCreatedAt: "2026-08-19T04:20:00.000Z",
        otherCreatorName: "兰登",
        otherId: "similar-88",
        score: 88,
        subjectId: "current",
      },
    ]);

    expect(result.get("current")).toEqual({
      count: 2,
      highestLevel: "high",
      latestMatchedResume: {
        createdAt: "2026-08-18T04:20:00.000Z",
        creatorImage: null,
        creatorName: "达里尔",
      },
    });
  });
});

describe("deleteDuplicateMatchesForSource", () => {
  it("is exported for cleaning duplicate rows when a resume is deleted", () => {
    expect(deleteDuplicateMatchesForSource).toBeTypeOf("function");
  });
});
