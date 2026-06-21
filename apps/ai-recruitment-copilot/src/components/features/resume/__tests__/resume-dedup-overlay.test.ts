import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("../resume-dedup-overlay.tsx", import.meta.url), "utf-8");

describe("ResumeDedupOverlay", () => {
  it("opens duplicate matches as resume records, not interview rounds", () => {
    expect(SOURCE).toContain('mode="resume"');
    expect(SOURCE).not.toContain('mode="interview"');
  });
});
