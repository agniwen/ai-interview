import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindStructuredResumeEvalCandidate,
  loadStructuredResumeEvalCorpus,
  validateCorpusCoverage,
} from "./dataset";

const fixtureManifest = resolve(import.meta.dirname, "fixtures/v1-synthetic/manifest.json");

describe("structured resume eval dataset", () => {
  it("loads a versioned, sanitized corpus with complete coverage", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);

    expect(corpus.cases).toHaveLength(100);
    expect(corpus.corpusHash).toMatch(/^[a-f0-9]{64}$/);
    expect(corpus.manifest.approval.status).toBe("pending");
  });

  it("rejects a corpus smaller than the rollout minimum", () => {
    expect(() => validateCorpusCoverage([])).toThrow("STRUCTURED_EVAL_CORPUS_TOO_SMALL:0");
  });

  it("binds separately generated candidate outputs to the exact corpus and engine", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);
    const candidate = {
      candidateVersion: "candidate-v1",
      corpusHash: corpus.corpusHash,
      engineVersion: corpus.manifest.engineVersion,
      generatedAt: "2026-07-30T00:00:00.000Z",
      modelId: corpus.manifest.modelId,
      outputs: corpus.cases.map((item) => ({
        caseId: item.id,
        output: item.baseline,
      })),
      promptVersion: corpus.manifest.promptVersion,
      schemaVersion: 1 as const,
    };

    expect(bindStructuredResumeEvalCandidate(corpus, candidate)).toHaveLength(100);
    expect(() =>
      bindStructuredResumeEvalCandidate(corpus, {
        ...candidate,
        engineVersion: "stale-engine",
      }),
    ).toThrow("STRUCTURED_EVAL_CANDIDATE_ENGINE_MISMATCH");
  });
});
