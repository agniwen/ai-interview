import { describe, expect, it } from "vitest";
import { classifyPositive } from "./classify";

const core = (
  ranked: { candidateId: string; score: number }[],
  retrieved: string[],
  loaded: string[],
) => ({ loadedIds: new Set(loaded), ranked, retrievedIds: new Set(retrieved) });
const inp = (over: Partial<Parameters<typeof classifyPositive>[0]>) => ({
  candidateId: "p",
  core: core([], [], []),
  hasAnyVector: true,
  jobDescriptionId: "j",
  ...over,
});

describe("classifyPositive", () => {
  it("无向量→not_indexed", () =>
    expect(classifyPositive(inp({ hasAnyVector: false })).klass).toBe("not_indexed"));
  it("有向量未检索→recall_capped", () =>
    expect(classifyPositive(inp({})).klass).toBe("recall_capped"));
  it("检索到但被过滤→status_filtered", () =>
    expect(classifyPositive(inp({ core: core([], ["p"], []) })).klass).toBe("status_filtered"));
  it("score<55→below_threshold", () => {
    const v = classifyPositive(
      inp({ core: core([{ candidateId: "p", score: 40 }], ["p"], ["p"]) }),
    );
    expect(v.klass).toBe("below_threshold");
    expect(v.score).toBe(40);
  });
  it("score>=55 但 shownRank>20→retrieved_low_rank", () => {
    const ranked = Array.from({ length: 25 }, (_, i) => ({ candidateId: `c${i}`, score: 90 - i }));
    ranked.push({ candidateId: "p", score: 60 });
    const ids = ranked.map((r) => r.candidateId);
    const v = classifyPositive(inp({ core: core(ranked, ids, ids) }));
    expect(v.klass).toBe("retrieved_low_rank");
    expect(v.shownRank).toBe(26);
  });
  it("score>=55 且 shownRank<=20→hit", () => {
    const v = classifyPositive(
      inp({ core: core([{ candidateId: "p", score: 80 }], ["p"], ["p"]) }),
    );
    expect(v.klass).toBe("hit");
    expect(v.rawRank).toBe(1);
  });
  it("同分按 candidateId 码点序破平", () => {
    const v = classifyPositive(
      inp({
        candidateId: "b",
        core: core(
          [
            { candidateId: "a", score: 80 },
            { candidateId: "b", score: 80 },
          ],
          ["a", "b"],
          ["a", "b"],
        ),
      }),
    );
    expect(v.rawRank).toBe(2);
  });
});
