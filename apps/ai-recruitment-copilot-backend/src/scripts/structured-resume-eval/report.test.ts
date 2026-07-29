import { describe, expect, it } from "vitest";
import { formatStructuredResumeEvalReport } from "./report";

describe("structured resume eval report", () => {
  it("includes immutable versions, thresholds, approval, and result", () => {
    const report = formatStructuredResumeEvalReport({
      corpusHash: "hash",
      gate: { failures: [], passed: true },
      generatedAt: "2026-07-29T00:00:00.000Z",
      manifest: {
        approval: {
          approvedAt: null,
          approver: null,
          status: "pending",
        },
        baselineVersion: "baseline-v1",
        casesFile: "cases.ts",
        corpusVersion: "corpus-v1",
        engineVersion: "engine-v1",
        goldLabelVersion: "gold-v1",
        modelId: "model-v1",
        promptVersion: "prompt-v1",
        schemaVersion: 1,
        thresholds: {
          artifactSchemaValidity: 1,
          compositeScoreMae: 3,
          compositeScoreMaxError: 15,
          compositeScoreP95Error: 8,
          deterministicInvariants: 1,
          evidenceCitationIntegrity: 1,
          gradeAgreement: 0.9,
          hardGateAgreement: 0.95,
          perRuleMacroF1: 0.9,
        },
      },
      metrics: {
        artifactSchemaValidity: 1,
        compositeScoreMae: 0,
        compositeScoreMaxError: 0,
        compositeScoreP95Error: 0,
        deterministicInvariants: 1,
        evidenceCitationIntegrity: 1,
        gradeAgreement: 1,
        hardGateAgreement: 1,
        minimumRuleMacroF1: 1,
        perRuleMacroF1: { rule: 1 },
        sampleCount: 100,
      },
    });

    expect(report).toContain("engine=engine-v1 prompt=prompt-v1 model=model-v1");
    expect(report).toContain("人工审批: pending");
    expect(report).toContain("阈值结果: PASS");
  });
});
