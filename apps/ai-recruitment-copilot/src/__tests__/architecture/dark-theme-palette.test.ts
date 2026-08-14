import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function relativeLuminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function compositeHex(foreground: string, background: string, alpha: number) {
  const channels = [1, 3, 5].map((offset) => {
    const foregroundChannel = Number.parseInt(foreground.slice(offset, offset + 2), 16);
    const backgroundChannel = Number.parseInt(background.slice(offset, offset + 2), 16);
    return Math.round(foregroundChannel * alpha + backgroundChannel * (1 - alpha));
  });

  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

describe("dark theme palette", () => {
  it("uses the homepage violet family for dark-mode brand colors", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/styles/globals.css"),
      "utf-8",
    );
    const darkTheme = globalStyles.match(/\.dark \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;

    expect(darkTheme).toContain("--primary: #c4b5fd");
    expect(darkTheme).toContain("--primary-foreground: #241d3f");
    expect(darkTheme).toContain("--ring: #a78bfa");
    expect(darkTheme).toContain("--sidebar-primary: #c4b5fd");
    expect(darkTheme).toContain("--sidebar-primary-foreground: #241d3f");
    expect(darkTheme).toContain("--sidebar-ring: #a78bfa");
    expect(darkTheme).toContain("--chart-1: #c4b5fd");
    expect(darkTheme).toContain("--chart-2: #e0eaff");
    expect(darkTheme).toContain("--chart-3: #f0abfc");
    expect(darkTheme).toContain("--chart-4: #fbcfe8");
    expect(darkTheme).toContain("--chart-5: #a5b4fc");
  });

  it("keeps branded controls and chart labels legible", () => {
    const charts = ["#c4b5fd", "#e0eaff", "#f0abfc", "#fbcfe8", "#a5b4fc"];

    expect(contrastRatio("#c4b5fd", "#241d3f")).toBeGreaterThanOrEqual(4.5);
    for (const chart of charts) {
      expect(contrastRatio(chart, "#241d3f")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(chart, compositeHex("#241d3f", chart, 0.8))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("derives touch and selection feedback from the active theme", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/styles/globals.css"),
      "utf-8",
    );

    expect(globalStyles).toContain(
      ".dark body {\n    -webkit-tap-highlight-color: color-mix(in oklab, var(--primary) 14%, transparent)",
    );
    expect(globalStyles).toContain("-webkit-tap-highlight-color: rgba(61, 142, 238, 0.14)");
    expect(globalStyles).toContain(".dark ::selection");
  });
});
