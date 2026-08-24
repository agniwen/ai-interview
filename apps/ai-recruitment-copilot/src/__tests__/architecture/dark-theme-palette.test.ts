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
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
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

describe("theme palette", () => {
  it("uses forest green only for light-mode brand tokens", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/styles/globals.css"),
      "utf-8",
    );
    const lightTheme = globalStyles.match(/:root \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;

    expect(lightTheme).toContain("--primary: #2d6a4f");
    expect(lightTheme).toContain("--primary-foreground: #ffffff");
    expect(lightTheme).toContain("--ring: #2d7a59");
    expect(lightTheme).toContain("--chart-1: #2d6a4f");
    expect(lightTheme).toContain("--secondary: #f5f5f5");
    expect(lightTheme).toContain("--muted: #f5f5f5");
    expect(lightTheme).toContain("--accent: #f5f5f5");
    expect(lightTheme).toContain("--border: #eeeeed");
    expect(lightTheme).toContain("--sidebar: #f7f7f7");
    expect(lightTheme).toContain("--sidebar-primary: oklch(0.3 0 0)");
    expect(lightTheme).toContain("--sidebar-ring: oklch(0.55 0 0)");
  });

  it("keeps the original Klein-blue dark theme", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/styles/globals.css"),
      "utf-8",
    );
    const darkTheme = globalStyles.match(/\.dark \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;

    expect(darkTheme).toContain("--background: oklch(0.215 0.018 254)");
    expect(darkTheme).toContain("--primary: #1d4ed8");
    expect(darkTheme).toContain("--primary-foreground: #ffffff");
    expect(darkTheme).toContain("--ring: #4f70d2");
    expect(darkTheme).toContain("--sidebar: #0e151e");
    expect(darkTheme).toContain("--sidebar-primary: #1d4ed8");
    expect(darkTheme).toContain("--sidebar-primary-foreground: #ffffff");
    expect(darkTheme).toContain("--sidebar-ring: #4f70d2");
    expect(darkTheme).toContain("--chart-1: #7699ef");
    expect(darkTheme).toContain("--chart-2: #86a9f4");
    expect(darkTheme).toContain("--chart-3: #9ebaf6");
    expect(darkTheme).toContain("--chart-4: #c7d8fa");
    expect(darkTheme).toContain("--chart-5: #7da1f3");
  });

  it("keeps the shared radar green in light mode and blue in dark mode", () => {
    const radarSource = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/components/ui/chart-radar.tsx"),
      "utf-8",
    );

    expect(radarSource).toContain('dark: "#7699ef"');
    expect(radarSource).toContain('light: "#2d6a4f"');
  });

  it("uses progressively darker theme colors for active pipeline stages", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/styles/globals.css"),
      "utf-8",
    );
    const realChart = readFileSync(
      path.join(
        repoRoot,
        "apps/ai-recruitment-copilot/src/components/features/studio/resumes/resume-library-charts.tsx",
      ),
      "utf-8",
    );
    const homepageMock = readFileSync(
      path.join(
        repoRoot,
        "apps/ai-recruitment-copilot/src/components/features/home/screens/resumes-screen.tsx",
      ),
      "utf-8",
    );
    const lightTheme = globalStyles.match(/:root \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;
    const darkTheme = globalStyles.match(/\.dark \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;
    const activePipelineColors = [
      ["screening", "var(--chart-4)"],
      ["ai-interview", "var(--chart-3)"],
      ["human-interview", "var(--chart-2)"],
      ["offer", "var(--chart-1)"],
    ] as const;

    for (const [token, themeColor] of activePipelineColors) {
      expect(lightTheme).toContain(`--pipeline-${token}: ${themeColor}`);
      expect(darkTheme).toContain(`--pipeline-${token}: ${themeColor}`);
      expect(realChart).toContain(`var(--pipeline-${token})`);
      expect(homepageMock).toContain(`var(--pipeline-${token})`);
    }

    const semanticPipelineColors = [
      ["closed-hired", "#8dc096"],
      ["closed-rejected", "#dc8ebb"],
    ] as const;

    for (const [token, lightColor] of semanticPipelineColors) {
      expect(lightTheme).toContain(`--pipeline-${token}: ${lightColor}`);
      expect(darkTheme).toContain(`--pipeline-${token}: color-mix(in oklch, ${lightColor}`);
      expect(homepageMock).toContain(`var(--pipeline-${token})`);
    }
  });

  it("keeps branded controls and chart labels legible", () => {
    const charts = ["#7699ef", "#86a9f4", "#9ebaf6", "#c7d8fa", "#7da1f3"];
    const chartForeground = "#07173e";

    expect(contrastRatio("#2d6a4f", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#1d4ed8", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    for (const chart of charts) {
      expect(contrastRatio(chart, chartForeground)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(chart, compositeHex(chartForeground, chart, 0.8)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("derives touch and selection feedback from the active theme", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/ai-recruitment-copilot/src/styles/globals.css"),
      "utf-8",
    );

    expect(globalStyles).toContain(
      "-webkit-tap-highlight-color: color-mix(in oklab, var(--primary) 14%, transparent)",
    );
    expect(globalStyles).toContain("background: color-mix(in oklab, var(--primary) 22%, white)");
    expect(globalStyles).toContain(".dark ::selection");
  });
});
