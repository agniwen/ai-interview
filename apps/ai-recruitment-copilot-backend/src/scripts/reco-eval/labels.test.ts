import { describe, expect, it } from "vitest";
import { dedupeLabels, labelKey, validateLabels } from "./labels";
import type { PositiveLabel } from "./types";

const L = (jd: string, c: string, source: "mined" | "manual" = "mined"): PositiveLabel => ({
  candidateId: c,
  jobDescriptionId: jd,
  label: "positive",
  source,
});

describe("labels", () => {
  it("dedupe：manual 优先并计冲突", () => {
    const r = dedupeLabels([L("j", "c1", "mined"), L("j", "c1", "manual"), L("j", "c2")]);
    expect(r.labels).toHaveLength(2);
    expect(r.labels.find((l) => l.candidateId === "c1")?.source).toBe("manual");
    expect(r.conflicts).toBe(1);
  });
  it("validate：不在 validKeys 的被剔除并计数", () => {
    const r = validateLabels(
      [L("j", "c1"), L("j", "cX")],
      new Set([labelKey({ candidateId: "c1", jobDescriptionId: "j" })]),
    );
    expect(r.valid.map((l) => l.candidateId)).toEqual(["c1"]);
    expect(r.invalid).toBe(1);
  });
});
