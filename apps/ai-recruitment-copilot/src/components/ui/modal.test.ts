import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("modal.tsx", import.meta.url), "utf-8");

describe("Modal size mapping", () => {
  it("supports a 1200px-class dialog width for broad detail panels", () => {
    expect(source).toContain('"3xl"');
    expect(source).toContain('"3xl": "sm:w-[min(96vw,1200px)] sm:max-w-none"');
  });
});
