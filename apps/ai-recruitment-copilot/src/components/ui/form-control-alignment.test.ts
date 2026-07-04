import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkboxSource = readFileSync(new URL("./checkbox.tsx", import.meta.url), "utf-8");
const fieldSource = readFileSync(new URL("./field.tsx", import.meta.url), "utf-8");
const radioSource = readFileSync(new URL("./radio-group.tsx", import.meta.url), "utf-8");

describe("Base UI form control alignment", () => {
  it("centers direct checkbox and radio controls inside field labels", () => {
    expect(fieldSource).toContain("has-[>[data-slot=checkbox]]:items-center");
    expect(fieldSource).toContain("has-[>[data-slot=radio-group-item]]:items-center");
  });

  it("keeps Base UI checkbox and radio roots optically centered as inline controls", () => {
    for (const source of [checkboxSource, radioSource]) {
      expect(source).toContain("inline-flex");
      expect(source).toContain("items-center");
      expect(source).toContain("justify-center");
      expect(source).toContain("align-middle");
    }
  });
});
