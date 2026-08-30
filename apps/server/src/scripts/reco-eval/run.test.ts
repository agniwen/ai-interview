import { describe, expect, it, vi } from "vitest";
import { runEval } from "./run";
import type { PositiveLabel } from "./types";

const lab = (jd: string, c: string): PositiveLabel => ({
  candidateId: c,
  jobDescriptionId: jd,
  label: "positive",
  source: "mined",
});
const okJd = { description: "d", id: "j", name: "n", prompt: "p" };

describe("runEval", () => {
  it("命中并算覆盖率", async () => {
    const deps = {
      hasVector: vi.fn(() => Promise.resolve(true)),
      loadJd: vi.fn(() => Promise.resolve(okJd)),
      score: vi.fn(() =>
        Promise.resolve({
          loadedIds: new Set(["c1"]),
          ranked: [{ candidateId: "c1", score: 80 }],
          retrievedIds: new Set(["c1"]),
        }),
      ),
    };
    const r = await runEval({
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      deps: deps as never,
      labels: [lab("j", "c1")],
      organizationId: "org",
    });
    expect(r.metrics.recallAt20Shown).toBe(1);
    expect(r.coverage).toBe(1);
  });
  it("整岗远程失败时该岗正例整体排除(不混入部分样本)", async () => {
    const deps = {
      hasVector: vi.fn((id: string) =>
        id === "c2" ? Promise.reject(new Error("qdrant timeout")) : Promise.resolve(true),
      ),
      loadJd: vi.fn(() => Promise.resolve(okJd)),
      score: vi.fn(() =>
        Promise.resolve({
          loadedIds: new Set(["c1"]),
          ranked: [{ candidateId: "c1", score: 80 }],
          retrievedIds: new Set(["c1"]),
        }),
      ),
    };
    const r = await runEval({
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      deps: deps as never,
      labels: [lab("j", "c1"), lab("j", "c2")],
      organizationId: "org",
    });
    expect(r.failedJds).toEqual(["j"]);
    expect(r.evaluated).toBe(0);
    expect(r.verdicts).toHaveLength(0);
    expect(r.coverage).toBe(0);
  });
});
