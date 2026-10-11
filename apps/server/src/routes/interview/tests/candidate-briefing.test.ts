import { describe, expect, it } from "vitest";
import { resolveCandidateCompanyContext } from "../candidate-briefing";

describe("resolveCandidateCompanyContext", () => {
  it("uses the current global config when an older interview snapshot has no company context", () => {
    expect(
      resolveCandidateCompanyContext({
        currentCompanyContext: "当前上下文设置中的公司简介",
        snapshotCompanyContext: "",
      }),
    ).toBe("当前上下文设置中的公司简介");
  });

  it("falls back to the interview snapshot when the current config is unavailable", () => {
    expect(
      resolveCandidateCompanyContext({
        currentCompanyContext: null,
        snapshotCompanyContext: "快照中的公司资料",
      }),
    ).toBe("快照中的公司资料");
  });
});
