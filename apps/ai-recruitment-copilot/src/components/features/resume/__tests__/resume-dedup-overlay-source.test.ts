import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../resume-dedup-overlay.tsx", import.meta.url), "utf-8");

describe("ResumeDedupMatchList display id", () => {
  it("shows the masked resume id next to duplicate candidate names", () => {
    expect(source).toContain("formatResumeCandidateTitle(match.candidateName, match.id)");
  });
});
