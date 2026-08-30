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
  it("keeps light-mode analytics independent from the brand green", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/globals.css"),
      "utf-8",
    );
    const lightTheme = globalStyles.match(/:root \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;

    expect(lightTheme).toContain("--primary: #a3d387");
    expect(lightTheme).toContain("--primary-foreground: #203526");
    expect(lightTheme).toContain("--primary-border: #a7d08b");
    expect(lightTheme).toContain("--primary-link: #567f40");
    expect(lightTheme).toContain("--ring: #8fbd74");
    expect(lightTheme).toContain("--chart-1: #38bdf8");
    expect(lightTheme).toContain("--chart-2: #c084fc");
    expect(lightTheme).toContain("--chart-3: #2dd4bf");
    expect(lightTheme).toContain("--chart-4: #fbbf24");
    expect(lightTheme).toContain("--chart-5: #f472b6");
    expect(lightTheme).toContain("--secondary: #f5f5f5");
    expect(lightTheme).toContain("--muted: #f5f5f5");
    expect(lightTheme).toContain("--accent: #f5f5f5");
    expect(lightTheme).toContain("--border: #eeeeed");
    expect(lightTheme).toContain("--sidebar: #f7f7f7");
    expect(lightTheme).toContain("--sidebar-primary: oklch(0.3 0 0)");
    expect(lightTheme).toContain("--sidebar-ring: oklch(0.55 0 0)");
  });

  it("keeps Klein-blue actions while separating the dark analytics palette", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/globals.css"),
      "utf-8",
    );
    const darkTheme = globalStyles.match(/\.dark \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;

    expect(darkTheme).toContain("--background: oklch(0.215 0.018 254)");
    expect(darkTheme).toContain("--primary: #1d4ed8");
    expect(darkTheme).toContain("--primary-foreground: #ffffff");
    expect(darkTheme).toContain("--primary-border: var(--ring)");
    expect(darkTheme).toContain("--primary-link: var(--primary)");
    expect(darkTheme).toContain("--ring: #4f70d2");
    expect(darkTheme).toContain("--sidebar: #0e151e");
    expect(darkTheme).toContain("--sidebar-primary: #1d4ed8");
    expect(darkTheme).toContain("--sidebar-primary-foreground: #ffffff");
    expect(darkTheme).toContain("--sidebar-ring: #4f70d2");
    expect(darkTheme).toContain("--chart-1: #38bdf8");
    expect(darkTheme).toContain("--chart-2: #c084fc");
    expect(darkTheme).toContain("--chart-3: #2dd4bf");
    expect(darkTheme).toContain("--chart-4: #fbbf24");
    expect(darkTheme).toContain("--chart-5: #f472b6");
  });

  it("keeps the shared radar green in light mode and blue in dark mode", () => {
    const radarSource = readFileSync(
      path.join(repoRoot, "apps/web/src/components/ui/chart-radar.tsx"),
      "utf-8",
    );

    expect(radarSource).toContain('dark: "#7699ef"');
    expect(radarSource).toContain('light: "#a3d387"');
  });

  it("uses the accessible brand shade for link buttons", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/globals.css"),
      "utf-8",
    );
    const buttonSource = readFileSync(
      path.join(repoRoot, "apps/web/src/components/ui/button.tsx"),
      "utf-8",
    );
    const evaluationDocumentSource = readFileSync(
      path.join(
        repoRoot,
        "apps/web/src/components/features/studio/interviews/candidate-evaluation-document-cell.tsx",
      ),
      "utf-8",
    );
    const typesetStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/typeset.css"),
      "utf-8",
    );

    expect(globalStyles).toContain("--color-primary-link: var(--primary-link)");
    expect(globalStyles).toContain("--color-primary-border: var(--primary-border)");
    expect(buttonSource).toContain("border border-primary-border bg-primary");
    expect(buttonSource).toContain('link: "text-primary-link underline-offset-4 hover:underline"');
    expect(evaluationDocumentSource).toContain(
      'className="text-primary-link underline underline-offset-4 hover:text-primary-link/80"',
    );
    expect(typesetStyles).toContain("color: var(--color-primary-link, currentColor)");
  });

  it("uses the shared progressive colors for active pipeline stages", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/globals.css"),
      "utf-8",
    );
    const realChart = readFileSync(
      path.join(
        repoRoot,
        "apps/web/src/components/features/studio/resumes/resume-library-charts.tsx",
      ),
      "utf-8",
    );
    const homepageMock = readFileSync(
      path.join(repoRoot, "apps/web/src/components/features/home/screens/resumes-screen.tsx"),
      "utf-8",
    );
    const lightTheme = globalStyles.match(/:root \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;
    const darkTheme = globalStyles.match(/\.dark \{(?<tokens>[\s\S]*?)\n\}/)?.groups?.tokens;
    const activePipelineColors = [
      ["screening", "color-mix(in oklab, var(--primary) 28%, var(--muted))"],
      ["ai-interview", "color-mix(in oklab, var(--primary) 52%, var(--muted))"],
      ["human-interview", "color-mix(in oklab, var(--primary) 76%, var(--muted))"],
      ["offer", "var(--primary)"],
    ] as const;

    for (const [token, themeColor] of activePipelineColors) {
      expect(lightTheme).toContain(`--pipeline-${token}: ${themeColor}`);
      expect(darkTheme).toContain(`--pipeline-${token}: ${themeColor}`);
      expect(realChart).toContain(`var(--pipeline-${token})`);
      expect(homepageMock).toContain(`var(--pipeline-${token})`);
    }

    expect(lightTheme).toContain("--pipeline-closed-hired: var(--chart-3)");
    expect(darkTheme).toContain("--pipeline-closed-hired: var(--chart-3)");
    expect(lightTheme).toContain("--pipeline-closed-rejected: var(--chart-5)");
    expect(darkTheme).toContain("--pipeline-closed-rejected: var(--chart-5)");
    expect(homepageMock).toContain("var(--pipeline-closed-hired)");
    expect(homepageMock).toContain("var(--pipeline-closed-rejected)");
    expect(lightTheme).toContain("--chart-conversion: #7c3aed");
    expect(lightTheme).toContain("--chart-conversion-muted: #c4b5fd");
    expect(darkTheme).toContain("--chart-conversion: #7c3aed");
    expect(darkTheme).toContain("--chart-conversion-muted: #c4b5fd");
    expect(realChart).toContain('const CONVERSION_ACCENT = "var(--chart-conversion)"');
    expect(homepageMock).toContain('const CONVERSION_ACCENT = "var(--chart-conversion)"');
  });

  it("keeps branded controls and chart labels legible", () => {
    const charts = ["#38bdf8", "#c084fc", "#2dd4bf", "#fbbf24", "#f472b6"];
    const chartForeground = "#07173e";

    expect(contrastRatio("#a3d387", "#203526")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#567f40", "#ffffff")).toBeGreaterThanOrEqual(4.5);
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
      path.join(repoRoot, "apps/web/src/styles/globals.css"),
      "utf-8",
    );

    expect(globalStyles).toContain(
      "-webkit-tap-highlight-color: color-mix(in oklab, var(--primary) 14%, transparent)",
    );
    expect(globalStyles).toContain("background: color-mix(in oklab, var(--primary) 22%, white)");
    expect(globalStyles).toContain(".dark ::selection");
  });
});
