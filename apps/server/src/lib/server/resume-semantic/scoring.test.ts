import { describe, expect, it } from "vitest";
import { mergeVectorScores, weightedScore } from "./scoring";

describe("mergeVectorScores", () => {
  it("按传入 sourceType 过滤，忽略其他 sourceType 的命中", () => {
    const merged = mergeVectorScores(
      [
        { chunkType: "skill_role", score: 0.9, sourceId: "jd-1", sourceType: "job_description" },
        {
          chunkType: "skill_role",
          score: 0.99,
          sourceId: "candidate-1",
          sourceType: "studio_interview",
        },
      ],
      "job_description",
    );
    expect([...merged.keys()]).toEqual(["jd-1"]);
    expect(merged.get("jd-1")).toEqual({ skillRole: 0.9 });
  });

  it("传 studio_interview 只并候选人命中", () => {
    const merged = mergeVectorScores(
      [
        { chunkType: "skill_role", score: 0.9, sourceId: "jd-1", sourceType: "job_description" },
        {
          chunkType: "skill_role",
          score: 0.99,
          sourceId: "candidate-1",
          sourceType: "studio_interview",
        },
      ],
      "studio_interview",
    );
    expect([...merged.keys()]).toEqual(["candidate-1"]);
    expect(merged.get("candidate-1")).toEqual({ skillRole: 0.99 });
  });
});

describe("weightedScore", () => {
  it("skillRole 0.9 / workProject 0.8 / resumeOverview 0.7 → 82", () => {
    expect(weightedScore({ resumeOverview: 0.7, skillRole: 0.9, workProject: 0.8 })).toBe(82);
  });
});
