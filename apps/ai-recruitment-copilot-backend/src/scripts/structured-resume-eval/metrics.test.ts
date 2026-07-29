import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStructuredResumeEvalCorpus } from "./dataset";
import { computeStructuredResumeEvalMetrics, evaluateStructuredResumeThresholds } from "./metrics";

const fixtureManifest = resolve(import.meta.dirname, "fixtures/v1-synthetic/manifest.json");

describe("structured resume eval metrics", () => {
  it("passes a perfect deterministic baseline", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);
    const metrics = computeStructuredResumeEvalMetrics(corpus.cases);
    const gate = evaluateStructuredResumeThresholds(metrics, corpus.manifest.thresholds);

    expect(metrics).toMatchObject({
      artifactSchemaValidity: 1,
      compositeScoreMae: 0,
      compositeScoreMaxError: 0,
      compositeScoreP95Error: 0,
      deterministicInvariants: 1,
      evidenceCitationIntegrity: 1,
      gradeAgreement: 1,
      hardGateAgreement: 1,
      minimumRuleMacroF1: 1,
      sampleCount: 100,
    });
    expect(gate).toEqual({ failures: [], passed: true });
  });

  it("fails any threshold regression", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);
    const [firstCase] = corpus.cases;
    expect(firstCase).toBeDefined();
    if (!firstCase) {
      return;
    }
    firstCase.baseline.artifactSchemaValid = false;
    firstCase.baseline.compositeScore = 0;
    const metrics = computeStructuredResumeEvalMetrics(corpus.cases);
    const gate = evaluateStructuredResumeThresholds(metrics, corpus.manifest.thresholds);

    expect(gate.passed).toBe(false);
    expect(gate.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("artifactSchemaValidity"),
        expect.stringContaining("compositeScoreMaxError"),
      ]),
    );
  });
});
