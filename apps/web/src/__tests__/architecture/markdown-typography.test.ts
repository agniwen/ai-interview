import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

describe("MiSans typography", () => {
  it("uses MiSans SemiBold's native 520 weight for emphasized text", () => {
    const globalStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/globals.css"),
      "utf-8",
    );
    const typesetStyles = readFileSync(
      path.join(repoRoot, "apps/web/src/styles/typeset.css"),
      "utf-8",
    );

    expect(globalStyles).toContain("--font-weight-semibold: 520");
    expect(globalStyles).toContain("--font-weight-bold: 520");
    expect(globalStyles).toContain("font-synthesis-weight: none");
    expect(globalStyles).toMatch(/:where\(strong, b\) \{\s+font-weight: 520;/);
    expect(typesetStyles).toContain("--typeset-font-weight-strong: 520");
    expect(typesetStyles).toContain("font-weight: var(--typeset-font-weight-strong)");
    expect(typesetStyles).not.toContain("font-weight: 600");
  });
});
