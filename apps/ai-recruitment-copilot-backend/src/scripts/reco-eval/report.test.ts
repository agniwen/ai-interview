import { describe, expect, it } from "vitest";
import { formatReport } from "./report";

const metrics = {
  evaluated: 2,
  failureCounts: {
    below_threshold: 0,
    not_indexed: 0,
    recall_capped: 1,
    retrieved_low_rank: 0,
    status_filtered: 0,
  },
  jds: 1,
  macroMrr: 0.5,
  macroRecallAt20Raw: 0.5,
  macroRecallAt20Shown: 0.5,
  macroRecallAt50Raw: 1,
  mrr: 0.5,
  perJd: [
    {
      failureCounts: {
        below_threshold: 0,
        not_indexed: 0,
        recall_capped: 1,
        retrieved_low_rank: 0,
        status_filtered: 0,
      },
      hits: 1,
      jobDescriptionId: "j",
      positives: 2,
    },
  ],
  recallAt20Raw: 0.5,
  recallAt20Shown: 0.5,
  recallAt50Raw: 1,
};
const meta = {
  collection: "resume_semantic_v1",
  embedding: "text-embedding-v4@v1",
  endedAt: "t1",
  gitSha: "abc",
  labelHash: "h",
  mode: "b-only",
  org: "org_default",
  recall: "[40,50,50] th=55 topK=20",
  sourceCounts: "mined=2 manual=0 invalid=0",
  startedAt: "t0",
  total: 2,
};

describe("formatReport", () => {
  it("含元数据/覆盖率/五类/宏平均/按岗表", () => {
    const s = formatReport({ coverage: 1, failedJds: [], meta, metrics });
    for (const k of [
      "recall@20_shown",
      "recall_capped",
      "覆盖率",
      "git=abc",
      "embedding=text-embedding-v4@v1",
      "宏平均",
      "按岗位",
    ]) {
      expect(s).toContain(k);
    }
  });
  it("覆盖率<80% 标警告", () => {
    expect(formatReport({ coverage: 0.5, failedJds: ["jX"], meta, metrics })).toContain("⚠️");
  });
});
