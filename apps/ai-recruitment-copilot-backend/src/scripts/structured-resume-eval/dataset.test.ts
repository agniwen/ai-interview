import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStructuredResumeEvalCorpus, validateCorpusCoverage } from "./dataset";

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
});
