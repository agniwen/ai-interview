import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cardSource = readFileSync(new URL("../resume-library-card.tsx", import.meta.url), "utf-8");

describe("resume library card dark theme", () => {
  it("uses the page background at rest and the former surface color on hover", () => {
    expect(cardSource).toContain(': "dark:bg-background dark:hover:bg-input/30"');
    expect(cardSource).not.toContain(': "dark:bg-input/30"');
  });
});
